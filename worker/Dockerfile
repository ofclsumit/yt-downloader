# Stage 1: Deno binary from official image
FROM denoland/deno:bin-2.2.3 AS deno-bin

# Stage 2: Media Processing Worker container
FROM python:3.11-slim

# Prevent Python from writing .pyc files and buffer stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Copy Deno binary into system PATH
COPY --from=deno-bin /deno /usr/local/bin/deno

# Install system dependencies: FFmpeg, FFprobe (bundled with ffmpeg), curl, ca-certificates, and nodejs
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates \
    curl \
    nodejs \
    && (which node >/dev/null 2>&1 || ln -s $(which nodejs) /usr/local/bin/node) \
    && rm -rf /var/lib/apt/lists/*

# Verify system binaries at build time (FFmpeg, FFprobe, Deno, Node)
RUN ffmpeg -version && ffprobe -version && deno --version && (node -v || nodejs -v)

WORKDIR /app

# Install Python requirements (including yt-dlp[default] and yt-dlp-ejs)
COPY worker/requirements.txt /app/worker/requirements.txt
RUN pip install --no-cache-dir -r /app/worker/requirements.txt

# Copy application files
COPY . /app/

# Expose port 10000 for Render Web Service health checks (Free Tier compatibility)
EXPOSE 10000

# Run worker module
CMD ["python", "-m", "worker.worker"]
