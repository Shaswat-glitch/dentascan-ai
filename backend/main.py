import base64
import io
import cv2
import numpy as np
import torch
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image
import clip
from torchvision import models, transforms
from skimage import feature, filters, morphology, measure
from scipy import ndimage
import warnings

warnings.filterwarnings("ignore")

app = FastAPI(title="DentaScan UV-AI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    image: str  # Base64 encoded image string


def base64_to_cv2(base64_string: str) -> np.ndarray:
    if ',' in base64_string:
        base64_string = base64_string.split(',')[1]
    img_data = base64.b64decode(base64_string)
    np_arr = np.frombuffer(img_data, np.uint8)
    img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Invalid image data")
    return img


def cv2_to_base64(img: np.ndarray) -> str:
    _, buffer = cv2.imencode('.png', img)
    base64_str = base64.b64encode(buffer).decode('utf-8')
    return f"data:image/png;base64,{base64_str}"


class TeethAnalyzer:
    def __init__(self):
        print("Loading AI Models... This may take a moment.")
        # Device configuration
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        
        # Load OpenAI CLIP (ViT-L/14)
        self.clip_model, self.clip_preprocess = clip.load("ViT-L/14", device=self.device)
        self.clip_model.eval()
        
        # Load EfficientNet-B4
        from torchvision.models import efficientnet_b4, EfficientNet_B4_Weights
        effnet = efficientnet_b4(weights=EfficientNet_B4_Weights.DEFAULT).to(self.device)
        effnet.eval()
        self.feature_extractor = torch.nn.Sequential(*list(effnet.children())[:-1]).to(self.device)
        self.feature_extractor.eval()
        self.effnet_transform = transforms.Compose([
            transforms.Resize((380, 380)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406],
                                 [0.229, 0.224, 0.225])
        ])
        
        self.DENTAL_PROMPTS = {
            "healthy":          "UV fluorescence photo of clean healthy teeth with uniform bright white blue glow and no dark spots",
            "mild_plaque":      "UV fluorescence photo of teeth with mild plaque showing slight dark patches near gumline",
            "heavy_plaque":     "UV fluorescence photo of teeth with heavy plaque and bacterial buildup showing many dark patches",
            "caries":           "UV fluorescence photo of teeth with cavities and dental caries showing dark lesions on enamel",
            "calculus":         "UV fluorescence photo of teeth with tartar and calculus deposits showing yellow green fluorescence",
            "stained":          "UV fluorescence photo of severely stained or discolored teeth with uneven dark fluorescence",
        }
        print("Models loaded successfully.")

    def preprocess_uv_image(self, img_bgr: np.ndarray):
        img_resized = cv2.resize(img_bgr, (640, 480))
        img_rgb     = cv2.cvtColor(img_resized, cv2.COLOR_BGR2RGB)
        img_hsv     = cv2.cvtColor(img_resized, cv2.COLOR_BGR2HSV)
        img_lab     = cv2.cvtColor(img_resized, cv2.COLOR_BGR2LAB)
        
        v_channel = img_hsv[:, :, 2]
        otsu_thresh, bright_mask_otsu = cv2.threshold(
            v_channel, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU
        )
        lower_uv = np.array([85,  20, 150])
        upper_uv = np.array([130, 255, 255])
        uv_color_mask = cv2.inRange(img_hsv, lower_uv, upper_uv)

        l_channel = img_lab[:, :, 0]
        _, l_mask = cv2.threshold(l_channel, 160, 255, cv2.THRESH_BINARY)

        combined_mask = cv2.bitwise_or(bright_mask_otsu, uv_color_mask)
        combined_mask = cv2.bitwise_or(combined_mask, l_mask)

        kernel     = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
        clean_mask = cv2.morphologyEx(combined_mask, cv2.MORPH_CLOSE, kernel, iterations=3)
        clean_mask = cv2.morphologyEx(clean_mask,    cv2.MORPH_OPEN,  kernel, iterations=1)

        teeth_roi = cv2.bitwise_and(img_rgb, img_rgb, mask=clean_mask)

        return img_rgb, img_hsv, img_lab, clean_mask, teeth_roi

    def analyze_uv_fluorescence(self, img_rgb, mask):
        mask_bool  = mask > 0
        roi_pixels = img_rgb[mask_bool]

        if len(roi_pixels) == 0:
            return {
                "fluorescence_intensity": 0, "blue_dominance_ratio": 0, "red_fluor_ratio": 0,
                "uniformity_score": 0, "dark_spot_coverage": 0, "whiteness_index": 0, "channel_balance": 0
            }

        r_vals = roi_pixels[:, 0].astype(float)
        g_vals = roi_pixels[:, 1].astype(float)
        b_vals = roi_pixels[:, 2].astype(float)

        intensity_mean = np.mean(r_vals * 0.299 + g_vals * 0.587 + b_vals * 0.114)
        intensity_std  = np.std(r_vals * 0.299 + g_vals * 0.587 + b_vals * 0.114)

        blue_dom_ratio = np.mean(b_vals) / (np.mean(r_vals) + np.mean(g_vals) + np.mean(b_vals) + 1e-6)
        red_fluor_ratio = np.mean(r_vals) / (np.mean(b_vals) + 1e-6)
        uniformity_score = 1.0 - min(intensity_std / 128.0, 1.0)

        brightness  = r_vals * 0.299 + g_vals * 0.587 + b_vals * 0.114
        if len(brightness[brightness > 10]) > 0:
            dark_thresh = np.percentile(brightness[brightness > 10], 15)
        else:
            dark_thresh = 0
        dark_ratio  = np.mean(brightness < dark_thresh)

        whiteness = np.mean(np.minimum(r_vals, np.minimum(g_vals, b_vals))) / 255.0
        channel_balance = 1.0 - (np.std([np.mean(r_vals), np.mean(g_vals), np.mean(b_vals)]) / 128.0)

        return {
            "fluorescence_intensity":   float(intensity_mean),
            "blue_dominance_ratio":     float(blue_dom_ratio),
            "red_fluor_ratio":          float(red_fluor_ratio),
            "uniformity_score":         float(uniformity_score),
            "dark_spot_coverage":       float(dark_ratio),
            "whiteness_index":          float(whiteness),
            "channel_balance":          float(channel_balance),
        }

    def detect_defects(self, img_rgb, mask):
        annotated = img_rgb.copy()
        mask_bool = mask > 0

        gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
        gray_masked = gray.copy()
        gray_masked[~mask_bool] = 255

        # Adaptive threshold
        dark_regions = cv2.adaptiveThreshold(
            gray_masked, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV, 25, 10
        )
        dark_regions[~mask_bool] = 0

        kernel_sm = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        dark_clean = cv2.morphologyEx(dark_regions, cv2.MORPH_OPEN, kernel_sm, iterations=2)

        contours_dark, _ = cv2.findContours(dark_clean, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        dark_count = 0
        for cnt in contours_dark:
            area = cv2.contourArea(cnt)
            if area > 80:
                dark_count += 1
                cv2.drawContours(annotated, [cnt], -1, (255, 60, 60), 2)

        # Red patches
        r_ch, g_ch, b_ch = img_rgb[:,:,0], img_rgb[:,:,1], img_rgb[:,:,2]
        red_dominant = (r_ch.astype(int) - b_ch.astype(int) > 30) & mask_bool
        red_map      = (red_dominant * 255).astype(np.uint8)
        red_clean    = cv2.morphologyEx(red_map, cv2.MORPH_OPEN, kernel_sm, iterations=1)
        contours_red, _ = cv2.findContours(red_clean, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        plaque_patches = sum(1 for c in contours_red if cv2.contourArea(c) > 150)

        for cnt in contours_red:
            if cv2.contourArea(cnt) > 150:
                cv2.drawContours(annotated, [cnt], -1, (255, 140, 0), 2)

        # Edges
        blurred  = cv2.GaussianBlur(gray_masked, (5, 5), 0)
        edges    = cv2.Canny(blurred, 30, 90)
        edges[~mask_bool] = 0
        edge_density = float(np.sum(edges > 0)) / max(np.sum(mask_bool), 1)

        teeth_pixels  = int(np.sum(mask_bool))
        dark_pixels   = int(np.sum(dark_clean > 0))
        dark_coverage = float(dark_pixels / max(teeth_pixels, 1))
        red_coverage  = float(int(np.sum(red_clean > 0)) / max(teeth_pixels, 1))

        defect_metrics = {
            "dark_spot_count":      dark_count,
            "dark_area_coverage":   dark_coverage,
            "plaque_patch_count":   plaque_patches,
            "red_coverage_ratio":   red_coverage,
            "edge_density":         edge_density,
            "teeth_pixel_count":    teeth_pixels,
        }

        return annotated, dark_clean, red_clean, defect_metrics

    def clip_classify(self, pil_image):
        labels  = list(self.DENTAL_PROMPTS.keys())
        texts   = list(self.DENTAL_PROMPTS.values())

        img_tensor   = self.clip_preprocess(pil_image).unsqueeze(0).to(self.device)
        text_tokens  = clip.tokenize(texts, truncate=True).to(self.device)

        with torch.no_grad():
            img_features  = self.clip_model.encode_image(img_tensor)
            text_features = self.clip_model.encode_text(text_tokens)

            img_features  = img_features  / img_features.norm(dim=-1, keepdim=True)
            text_features = text_features / text_features.norm(dim=-1, keepdim=True)
            similarity    = (100.0 * img_features @ text_features.T).softmax(dim=-1)
            probs         = similarity[0].cpu().numpy()

        return {k: float(v) for k,v in zip(labels, probs)}

    def compute_health_score(self, uv_params, defect_metrics, clip_scores):
        scores = {}
        # Module A
        intensity_score  = min(uv_params["fluorescence_intensity"] / 200.0, 1.0)
        blue_score       = min(uv_params["blue_dominance_ratio"] / 0.55, 1.0)
        red_penalty      = max(0.0, 1.0 - uv_params["red_fluor_ratio"] / 1.5)
        uniform_score    = uv_params["uniformity_score"]
        white_score      = uv_params["whiteness_index"]

        uv_score = (intensity_score * 0.25 + blue_score * 0.25 +
                    red_penalty * 0.20 + uniform_score * 0.15 + white_score * 0.15)
        scores["UV Fluorescence Quality"] = float(uv_score * 100)

        # Module B
        dark_pen   = max(0.0, 1.0 - defect_metrics["dark_area_coverage"] * 8)
        plaque_pen = max(0.0, 1.0 - defect_metrics["red_coverage_ratio"] * 5)
        spot_pen   = max(0.0, 1.0 - defect_metrics["dark_spot_count"] / 15)
        edge_pen   = max(0.0, 1.0 - defect_metrics["edge_density"] * 10)

        defect_score = (dark_pen * 0.30 + plaque_pen * 0.30 +
                        spot_pen * 0.25 + edge_pen * 0.15)
        scores["Defect-Free Surface"] = float(defect_score * 100)

        # Module C
        clip_weights = {
            "healthy":      1.0,
            "mild_plaque":  0.55,
            "heavy_plaque": 0.10,
            "caries":       0.00,
            "calculus":     0.20,
            "stained":      0.15,
        }
        clip_score = sum(clip_scores[k] * w for k, w in clip_weights.items())
        scores["AI Visual Assessment"] = float(clip_score * 100)

        overall = (scores["UV Fluorescence Quality"] * 0.40 +
                   scores["Defect-Free Surface"]     * 0.35 +
                   scores["AI Visual Assessment"]    * 0.25)
        scores["Overall Health Score"] = float(overall)

        if   overall >= 80: grade = "Excellent"
        elif overall >= 65: grade = "Good"
        elif overall >= 50: grade = "Fair"
        elif overall >= 35: grade = "Poor"
        else:               grade = "Critical"

        return scores, grade

    def analyze(self, img_bgr: np.ndarray):
        img_rgb, img_hsv, img_lab, clean_mask, teeth_roi = self.preprocess_uv_image(img_bgr)
        
        uv_params = self.analyze_uv_fluorescence(img_rgb, clean_mask)
        annotated_img, dark_map, red_map, defect_metrics = self.detect_defects(img_rgb, clean_mask)
        
        # CLIP predictions (Avg of full and ROI)
        img_pil = Image.fromarray(img_rgb)
        img_roi_pil = Image.fromarray(teeth_roi)
        results_full = self.clip_classify(img_pil)
        results_roi  = self.clip_classify(img_roi_pil)
        clip_scores = {k: (results_full[k] + results_roi[k]) / 2 for k in results_full}
        top_condition = max(clip_scores, key=clip_scores.get)
        
        health_scores, grade_label = self.compute_health_score(uv_params, defect_metrics, clip_scores)
        
        metrics = {
            "uv": uv_params,
            "defect": defect_metrics,
            "clip": clip_scores,
            "scores": health_scores
        }
        
        return health_scores["Overall Health Score"], grade_label, top_condition.replace("_", " ").title(), metrics, clean_mask, annotated_img

try:
    analyzer = TeethAnalyzer()
except Exception as e:
    print(f"Failed to initialize model: {e}")
    analyzer = None


@app.post("/analyze")
async def analyze_endpoint(request: AnalyzeRequest):
    if not analyzer:
        raise HTTPException(status_code=500, detail="Models are not initialized.")
    try:
        img_bgr = base64_to_cv2(request.image)
        overall, grade, top_prediction, metrics, masked_img, defect_map = analyzer.analyze(img_bgr)
        
        # Original Image from resized BGR
        img_resized = cv2.resize(img_bgr, (640, 480))
        b64_orig = cv2_to_base64(img_resized)
        
        # Scale back the mask to visually fit if needed (just visualizing the mask)
        # Using a colormap for mask to match "Blues" logic conceptually
        colored_mask = cv2.applyColorMap(masked_img, cv2.COLORMAP_WINTER)
        b64_masked = cv2_to_base64(colored_mask)
        
        # Defect map is RGB in Colab, convert to BGR for saving
        defect_bgr = cv2.cvtColor(defect_map, cv2.COLOR_RGB2BGR)
        b64_defect = cv2_to_base64(defect_bgr)
        
        return {
            "overall_score": overall,
            "grade": grade,
            "top_prediction": top_prediction,
            "metrics": metrics,
            "processed_images": [b64_orig, b64_masked, b64_defect]
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
