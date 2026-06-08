FROM node:20-bullseye-slim

# Install system dependencies for Playwright and Chromium
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    procps \
    libxss1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy dependency configs
COPY package*.json ./

# Install dependencies
RUN npm ci

# Install Playwright browser dependencies (specifically Chromium)
RUN npx playwright install chromium --with-deps

# Copy application code
COPY . .

# Build Vite frontend and esbuild server
RUN npm run build

# Expose server port
EXPOSE 3000

# Start Express server
CMD ["npm", "start"]
