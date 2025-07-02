# Simple Dockerfile for Render.com
FROM node:18-alpine

# Install Puppeteer dependencies
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Tell Puppeteer to use installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY client/package*.json ./client/

# Install dependencies
RUN npm ci --only=production
RUN cd client && npm ci

# Copy source code
COPY . .

# Build frontend
RUN cd client && npm run build

# Create necessary directories
RUN mkdir -p temp logs && chmod 755 temp logs

# Expose port (Render uses PORT env variable)
EXPOSE $PORT

# Start application
CMD ["node", "server/index.js"]