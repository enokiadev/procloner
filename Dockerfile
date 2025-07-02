# ProCloner Production Dockerfile
FROM node:18-alpine AS base

# Install dependencies needed for Puppeteer
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Tell Puppeteer to skip installing Chromium. We'll be using the installed package.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY client/package*.json ./client/

# Install dependencies
FROM base AS dependencies
RUN npm ci --only=production
RUN cd client && npm ci --only=production

# Build frontend
FROM base AS builder
COPY . .
RUN npm ci
RUN cd client && npm ci && npm run build

# Production stage
FROM base AS production

# Create non-root user for security
RUN addgroup -g 1001 -S procloner && \
    adduser -S procloner -u 1001

# Set environment variables
ENV NODE_ENV=production \
    PORT=3002 \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Copy production dependencies
COPY --from=dependencies /app/node_modules ./node_modules

# Copy application code
COPY --chown=procloner:procloner server ./server
COPY --chown=procloner:procloner package*.json ./

# Copy built frontend
COPY --from=builder --chown=procloner:procloner /app/client/dist ./client/dist

# Create temp directory for cloned content
RUN mkdir -p /app/temp && chown procloner:procloner /app/temp

# Create logs directory
RUN mkdir -p /app/logs && chown procloner:procloner /app/logs

# Switch to non-root user
USER procloner

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node server/healthcheck.js

# Expose port
EXPOSE 3002

# Start the application
CMD ["node", "server/index.js"]