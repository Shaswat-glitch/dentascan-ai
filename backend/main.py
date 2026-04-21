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
from transformers import CLIPSegProcessor, CLIPSegForImageSegmentation
from transformers import CLIPProcessor, CLIPModel
from scipy.ndimage import gaussian_filter
import warnings

warnings.filterwarnings("ignore")

app = FastAPI(title="DentaScan UV-AI (CLIPSeg)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AnalyzeRequest(BaseModel):
    image: str

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

class TeethAnalyzerCLIP:
    def __init__(self):
        print("Loading Hugging Face Transformers...")
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        
        self.seg_processor = CLIPSegProcessor.from_pretrained("CIDAS/clipseg-rd64-refined")
        self.seg_model     = CLIPSegForImageSegmentation.from_pretrained("CIDAS/clipseg-rd64-refined").to(self.device)
        self.seg_model.eval()
        
        self.clip_model     = CLIPModel.from_pretrained("openai/clip-vit-large-patch14").to(self.device)
        self.clip_processor = CLIPProcessor.from_pretrained("openai/clip-vit-large-patch14")
        self.clip_model.eval()

        self.CONDITION_PROMPTS = {
            "healthy":          "UV fluorescence photo of perfectly healthy teeth with bright uniform blue-white glow and no dark spots",
            "mild_plaque":      "UV fluorescence photo of teeth with mild plaque showing slight dark patches near gumline",
            "moderate_plaque":  "UV fluorescence photo of teeth with moderate plaque and several dark patches on surface",
            "heavy_plaque":     "UV fluorescence photo of teeth with heavy plaque buildup showing many large dark patches",
            "caries":           "UV fluorescence photo of teeth with dental cavities showing dark lesions and absent fluorescence spots",
            "calculus":         "UV fluorescence photo of teeth with tartar deposits showing yellowish-green fluorescence",
            "stained":          "UV fluorescence photo of severely stained discolored teeth with disrupted irregular dark fluorescence",
        }
        
        print("Models loaded successfully.")

    def build_teeth_mask(self, img_bgr, target_w=640, target_h=480):
        img = cv2.resize(img_bgr, (target_w, target_h))
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        v   = hsv[:, :, 2]
        H, W = img.shape[:2]

        otsu_t, otsu_mask = cv2.threshold(v, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        rel_t = np.percentile(v, 65)
        _, rel_mask = cv2.threshold(v, int(rel_t), 255, cv2.THRESH_BINARY)
        combined = cv2.bitwise_or(otsu_mask, rel_mask)

        spatial = np.zeros((H, W), dtype=np.uint8)
        spatial[int(H*0.18):int(H*0.82), int(W*0.04):int(W*0.96)] = 255
        combined = cv2.bitwise_and(combined, spatial)

        k_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
        k_open  = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        mask = cv2.morphologyEx(combined, cv2.MORPH_CLOSE, k_close, iterations=3)
        mask = cv2.morphologyEx(mask,     cv2.MORPH_OPEN,  k_open,  iterations=2)

        num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
        filtered = np.zeros_like(mask)
        MIN_AREA = 600
        candidates = []
        for i in range(1, num_labels):
            area = stats[i, cv2.CC_STAT_AREA]
            by   = stats[i, cv2.CC_STAT_TOP]
            bw   = stats[i, cv2.CC_STAT_WIDTH]
            bh   = stats[i, cv2.CC_STAT_HEIGHT]
            aspect = bw / (bh + 1e-6)
            if area < MIN_AREA: continue
            if aspect < 0.5:    continue
            if by > H * 0.78:   continue
            if bh > H * 0.65:   continue
            candidates.append((area, i))

        candidates.sort(reverse=True)
        for _, i in candidates[:6]:
            filtered[labels == i] = 255

        contours, _ = cv2.findContours(filtered, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        final = filtered.copy()
        if contours:
            pts = np.vstack(contours)
            _, _, wb, hb = cv2.boundingRect(pts)
            if wb / (hb + 1e-6) > 1.1 and wb < W * 0.95:
                try:
                    hull      = cv2.convexHull(pts)
                    hull_mask = np.zeros_like(filtered)
                    cv2.drawContours(hull_mask, [hull], -1, 255, cv2.FILLED)
                    kd      = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13))
                    dilated = cv2.dilate(filtered, kd, iterations=2)
                    final   = cv2.bitwise_and(hull_mask, dilated)
                except Exception:
                    pass

        img_rgb_r = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        roi       = cv2.bitwise_and(img_rgb_r, img_rgb_r, mask=final)
        return final, roi, img_rgb_r

    def clipseg_refine_mask(self, pil_img, existing_mask):
        prompts = [
            "teeth under UV fluorescence light",
            "white glowing teeth",
            "dental enamel fluorescence",
        ]
        img_352 = pil_img.resize((352, 352))
        W_orig, H_orig = pil_img.size

        all_heatmaps = []
        for prompt in prompts:
            inputs = self.seg_processor(
                text=[prompt], images=[img_352], return_tensors="pt", padding=True
            ).to(self.device)

            with torch.no_grad():
                outputs = self.seg_model(**inputs)

            logits  = outputs.logits[0].squeeze().cpu().numpy()
            logits  = gaussian_filter(logits, sigma=2)
            logits  = (logits - logits.min()) / (logits.max() - logits.min() + 1e-8)
            all_heatmaps.append(logits)

        avg_heatmap = np.mean(all_heatmaps, axis=0)
        heatmap_resized = cv2.resize(avg_heatmap.astype(np.float32), (W_orig, H_orig))

        heat_thresh = np.percentile(heatmap_resized, 40)
        seg_mask = (heatmap_resized > heat_thresh).astype(np.uint8) * 255

        if existing_mask is not None:
            existing_resized = cv2.resize(existing_mask, (W_orig, H_orig))
            combined = cv2.bitwise_and(seg_mask, existing_resized)
            if (combined > 0).mean() < 0.005:
                combined = seg_mask
        else:
            combined = seg_mask

        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
        combined = cv2.morphologyEx(combined, cv2.MORPH_CLOSE, k, iterations=2)
        combined = cv2.morphologyEx(combined, cv2.MORPH_OPEN,  k, iterations=1)

        return combined, heatmap_resized

    def clip_classify_condition(self, pil_img):
        labels = list(self.CONDITION_PROMPTS.keys())
        texts  = list(self.CONDITION_PROMPTS.values())

        inputs = self.clip_processor(
            text=texts, images=pil_img, return_tensors="pt", padding=True, truncation=True
        ).to(self.device)

        with torch.no_grad():
            outputs       = self.clip_model(**inputs)
            logits        = outputs.logits_per_image
            probabilities = logits.softmax(dim=-1)[0].cpu().numpy()

        return dict(zip(labels, probabilities.tolist()))

    def clip_analyze_uv_params(self, pil_img):
        param_prompts = {
            "fluorescence_intensity": {
                "high":   "teeth with very bright strong fluorescence glow under UV light",
                "medium": "teeth with moderate average fluorescence glow under UV light",
                "low":    "teeth with dim weak faint fluorescence under UV light",
            },
            "blue_white_uniformity": {
                "high":   "teeth with perfectly uniform even blue-white fluorescence",
                "medium": "teeth with somewhat uneven patchy fluorescence",
                "low":    "teeth with very uneven irregular fluorescence pattern with many dark areas",
            },
            "red_orange_areas": {
                "absent":    "teeth with no red or orange fluorescence areas",
                "minimal":   "teeth with tiny minimal red orange spots",
                "present":   "teeth with visible red orange fluorescence patches",
                "extensive": "teeth with large extensive red orange fluorescence areas",
            },
            "dark_lesion_count": {
                "none": "teeth with no dark spots or lesions under UV",
                "1-3":  "teeth with one to three small dark spots under UV",
                "4-7":  "teeth with four to seven dark spots under UV",
                "8+":   "teeth with many eight or more dark spots under UV",
            },
        }

        results = {}
        for param, options in param_prompts.items():
            option_labels = list(options.keys())
            option_texts  = list(options.values())
            inputs = self.clip_processor(
                text=option_texts, images=pil_img, return_tensors="pt", padding=True, truncation=True
            ).to(self.device)
            with torch.no_grad():
                out   = self.clip_model(**inputs)
                probs = out.logits_per_image.softmax(dim=-1)[0].cpu().numpy()
            best = option_labels[int(np.argmax(probs))]
            results[param] = best

        return results

    def scores_from_condition(self, condition, uv_params):
        base_scores = {
            "healthy": 90, "mild_plaque": 72, "moderate_plaque": 55,
            "heavy_plaque": 38, "caries": 28, "calculus": 35, "stained": 45,
        }
        score = base_scores.get(condition, 60)

        intensity_adj = {"high": +5, "medium": 0, "low": -8}
        uniformity_adj = {"high": +5, "medium": 0, "low": -8}
        lesion_adj = {"none": +5, "1-3": -3, "4-7": -10, "8+": -18}
        red_adj = {"absent": +3, "minimal": 0, "present": -5, "extensive": -12}

        score += intensity_adj.get(uv_params.get("fluorescence_intensity", "medium"), 0)
        score += uniformity_adj.get(uv_params.get("blue_white_uniformity", "medium"), 0)
        score += lesion_adj.get(uv_params.get("dark_lesion_count", "none"), 0)
        score += red_adj.get(uv_params.get("red_orange_areas", "absent"), 0)

        return int(np.clip(score, 0, 100))

    def analyze(self, img_bgr: np.ndarray):
        final_mask, teeth_roi, img_resized_rgb = self.build_teeth_mask(img_bgr)
        
        img_pil_resized = Image.fromarray(img_resized_rgb)
        refined_mask, heatmap = self.clipseg_refine_mask(img_pil_resized, final_mask)
        
        teeth_roi_refined = cv2.bitwise_and(
            img_resized_rgb, img_resized_rgb, mask=refined_mask
        )
        
        coords = cv2.findNonZero(refined_mask)
        if coords is not None:
            xb, yb, wb, hb = cv2.boundingRect(coords)
            pad = 12
            crop = teeth_roi_refined[
                max(0, yb-pad):min(teeth_roi_refined.shape[0], yb+hb+pad),
                max(0, xb-pad):min(teeth_roi_refined.shape[1], xb+wb+pad)
            ]
            crop_pil = Image.fromarray(crop)
        else:
            crop_pil = Image.fromarray(teeth_roi_refined)

        clip_input_pil = crop_pil.resize((224, 224), Image.LANCZOS)
        
        condition_scores = self.clip_classify_condition(clip_input_pil)
        top_condition    = max(condition_scores, key=condition_scores.get)
        top_confidence   = condition_scores[top_condition]
        
        uv_params = self.clip_analyze_uv_params(clip_input_pil)
        health_score = self.scores_from_condition(top_condition, uv_params)

        gemini_analysis = {
            "overall_condition": top_condition,
            "health_score":      health_score,
            "confidence":        round(float(top_confidence), 2),
            "findings": {
                "plaque_detected":         top_condition not in ["healthy"],
                "plaque_severity":         "none" if top_condition == "healthy"
                                           else "mild" if "mild" in top_condition
                                           else "moderate" if "moderate" in top_condition
                                           else "severe" if "heavy" in top_condition else "mild",
                "plaque_location":         "gumline area" if "plaque" in top_condition else "none detected",
                "caries_detected":         top_condition == "caries",
                "caries_locations":        "dark lesions on enamel" if top_condition == "caries" else "none detected",
                "calculus_detected":       top_condition == "calculus",
                "fluorescence_uniformity": uv_params.get("blue_white_uniformity", "medium"),
                "dark_spot_coverage":      {"none":"<5%","1-3":"5-15%","4-7":"15-30%","8+":"30%+"}.get(
                                                uv_params.get("dark_lesion_count","none"), "5-10%"),
                "upper_teeth_condition":   "healthy" if health_score >= 75 else
                                           "mild_issues" if health_score >= 55 else "moderate_issues",
                "lower_teeth_condition":   "healthy" if health_score >= 75 else
                                           "mild_issues" if health_score >= 55 else "moderate_issues",
            },
            "uv_parameters": uv_params,
            "recommendations": [
                "Schedule a professional dental cleaning within 6 months" if health_score >= 70
                    else "Schedule an urgent dental appointment for professional cleaning",
                "Maintain twice-daily brushing with fluoride toothpaste and daily flossing",
                "Use UV fluorescence monitoring every 3 months to track plaque progression",
            ],
            "summary": (
                f"UV analysis indicates {top_condition.replace('_',' ')} with a health score of "
                f"{health_score}/100. Fluorescence intensity is {uv_params.get('fluorescence_intensity','moderate')} "
                f"with {uv_params.get('blue_white_uniformity','medium')} uniformity across the dental surface."
            ),
        }

        # Visualization logic
        overlay = img_resized_rgb.copy()
        green   = np.zeros_like(img_resized_rgb)
        green[refined_mask > 0] = [0, 220, 120]
        detected_img = cv2.addWeighted(overlay, 0.72, green, 0.28, 0)
        
        # Color mapped heatmap
        heatmap_colored = cv2.applyColorMap((heatmap * 255).astype(np.uint8), cv2.COLORMAP_JET)

        return gemini_analysis, img_resized_rgb, detected_img, heatmap_colored

try:
    analyzer = TeethAnalyzerCLIP()
except Exception as e:
    print(f"Failed to initialize model: {e}")
    import traceback
    traceback.print_exc()
    analyzer = None

@app.post("/analyze")
async def analyze_endpoint(request: AnalyzeRequest):
    if not analyzer:
        raise HTTPException(status_code=500, detail="Models are not initialized.")
    try:
        img_bgr = base64_to_cv2(request.image)
        gemini_analysis, img_resized, detected_img, heatmap_colored = analyzer.analyze(img_bgr)
        
        b64_orig    = cv2_to_base64(cv2.cvtColor(img_resized, cv2.COLOR_RGB2BGR))
        b64_masked  = cv2_to_base64(cv2.cvtColor(detected_img, cv2.COLOR_RGB2BGR))
        b64_heatmap = cv2_to_base64(heatmap_colored)
        
        return {
            "analysis": gemini_analysis,
            "processed_images": [b64_orig, b64_masked, b64_heatmap]
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)

