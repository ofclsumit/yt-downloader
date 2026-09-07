# Dockerfile for Render Media Processing Worker (Web Service / Free Tier compatible)
FROM python:3.11-slim

# Prevent Python from writing .pyc files and buffer stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install system dependencies: FFmpeg, curl, ca-certificates, and nodejs for yt-dlp JS challenges
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates \
    curl \
    nodejs \
    && rm -rf /var/lib/apt/lists/*

# Verify FFmpeg installation
RUN ffmpeg -version

WORKDIR /app

# Install Python requirements
COPY worker/requirements.txt /app/worker/requirements.txt
RUN pip install --no-cache-dir -r /app/worker/requirements.txt

# Copy application files
COPY . /app/

# Expose port 10000 for Render Web Service health checks (Free Tier compatibility)
EXPOSE 10000

# Run worker module
CMD ["python", "-m", "worker.worker"]
