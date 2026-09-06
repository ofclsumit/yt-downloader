FROM python:3.11-slim

# Prevent interactive prompts and set default environment variables
ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PORT=10000 \
    HOST=0.0.0.0

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

# Copy requirements and install python packages
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY . .

# Create runtime directories for downloads and temp clips
RUN mkdir -p /app/downloads /app/temp && chmod -R 777 /app/downloads /app/temp

# Expose port (Render defaults to 10000)
EXPOSE 10000

# Start FastAPI backend
CMD ["python", "youtube.py"]
