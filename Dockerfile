# Stage 1: Build the application
FROM node:22-alpine AS builder

WORKDIR /app

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the application (Vite for frontend, esbuild for backend)
RUN pnpm run build

# Stage 2: Production image
FROM node:22-alpine

WORKDIR /app

# Install Chromium and required system libraries for Puppeteer PDF generation
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto \
    font-noto-cjk

# Tell Puppeteer to use the system Chromium installed above
ENV CHROMIUM_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Copy built artifacts from builder stage
COPY --from=builder /app/dist ./dist

# Copy data directory (seed data, country guides, etc.)
COPY --from=builder /app/data ./data

# Copy drizzle migration SQL files
COPY --from=builder /app/drizzle/*.sql ./drizzle/

# Copy docker entrypoint script
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose the port
EXPOSE 3000

# Start the application via entrypoint (runs migrations then starts node)
ENTRYPOINT ["./docker-entrypoint.sh"]
