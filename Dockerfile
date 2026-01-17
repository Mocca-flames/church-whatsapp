# Stage 1: Builder
# Uses a full image to install dependencies, including those that need compilation (like 'canvas')
FROM node:20 AS builder

# Install system dependencies required for 'canvas' to compile
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    pkg-config \
    python3 \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./

# Install dependencies
RUN npm install

COPY . .

# Stage 2: Production
# Uses a minimal image and only installs runtime dependencies for 'canvas'
FROM node:20-slim AS production

# Install only the runtime system dependencies for 'canvas'
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    libcairo2 \
    libpango1.0-0 \
    libjpeg-dev \
    libgif7 \
    librsvg2-2 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy necessary files from the builder stage
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app .

# Since this is a WhatsApp bot, it typically does not expose a port.
# If a future feature requires a web server, EXPOSE 8080 or a similar port.

# Command to run the application
CMD [ "npm", "start" ]