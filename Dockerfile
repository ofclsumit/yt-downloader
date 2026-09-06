FROM python:3.11-slim

# Install system dependencies: FFmpeg, Chromium, ChromeDriver, Node.js
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    chromium \
    chromium-driver \
    nodejs \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set up working directory
WORKDIR /app

# Create a non-root user required by Hugging Face Spaces (UID 1000)
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    PORT=7860 \
    HOST=0.0.0.0

# Copy requirements and install python packages
COPY --chown=user:user requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Copy application files
COPY --chown=user:user youtube.py .
COPY --chown=user:user proxies.txt.example ./proxies.txt

# Create runtime directories for downloads and temp clips
RUN mkdir -p /home/user/downloads /home/user/temp /app/downloads /app/temp

# Hugging Face Spaces listens on port 7860
EXPOSE 7860

# Start FastAPI backend
CMD ["python", "youtube.py"]
