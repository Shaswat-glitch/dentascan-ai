FROM python:3.10-slim

WORKDIR /app

# Removed system dependencies since we use opencv-python-headless

# Copy requirements and install
COPY requirements.txt .
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend files
COPY . .

# Hugging Face Spaces maps external traffic to port 7860
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
