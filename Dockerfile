FROM node:20-slim

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install gateway dependencies
COPY gateway/package.json ./gateway/
RUN cd gateway && npm install

# Install apps dependencies
COPY apps/package.json ./apps/
RUN cd apps && npm install

# Copy source
COPY gateway/ ./gateway/
COPY apps/ ./apps/

# Build frontend TypeScript
RUN cd apps && npm run build

# Gateway serves on PORT (Railway injects this)
ENV PORT=8001
EXPOSE 8001

# Start gateway with static file serving
WORKDIR /app/gateway
CMD ["npx", "tsx", "src/index.ts"]
