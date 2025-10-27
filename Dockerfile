# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . ./

# Build Next.js in standalone mode
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Set to production
ENV NODE_ENV=production
ENV PORT=28848
ENV HOSTNAME=0.0.0.0

# Install curl for health check
RUN apk add --no-cache curl

# Copy standalone build from builder
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Expose port
EXPOSE 28848

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:28848/ || exit 1

# Start Next.js server
CMD ["node", "server.js"]
