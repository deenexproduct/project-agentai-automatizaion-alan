# ── Single-stage build for Railway ──────────────────
FROM node:18-slim

# Install Chrome dependencies + ffmpeg for WhatsApp Web.js and audio
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
  gnupg \
  wget \
  ca-certificates \
  fonts-liberation \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcups2 \
  libdbus-1-3 \
  libdrm2 \
  libgbm1 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  xdg-utils \
  ffmpeg \
  && wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
  && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends google-chrome-stable \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install ALL deps (need devDeps for tsc)
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps

# Copy source code
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npx tsc

# Remove devDependencies to slim the image
RUN npm prune --omit=dev

# Create required directories (wa-sessions will be a Railway Volume mount point)
RUN mkdir -p uploads wa-sessions

ENV NODE_ENV=production
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome

EXPOSE 3000

CMD ["node", "dist/index.js"]
