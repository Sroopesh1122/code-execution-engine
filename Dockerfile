# syntax=docker/dockerfile:1.7-labs

FROM python:3.11-slim-bookworm AS builder

RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends \
      openjdk-17-jdk-headless \
      g++ \
      make \
      nodejs \
      npm \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/*

WORKDIR /app

# Cache npm install layer
COPY package*.json ./
RUN npm ci --omit=dev

# Copy rest of code
COPY . .

# ────────────────────────────────────────────────
# Final image – slim & fast
# ────────────────────────────────────────────────
FROM python:3.11-slim-bookworm

# Copy only what's needed to run
COPY --from=builder /usr/bin/node /usr/bin/
COPY --from=builder /usr/lib/node_modules /usr/lib/node_modules
COPY --from=builder /usr/bin/npm /usr/bin/npm

# Java runtime (headless variant)
COPY --from=builder /usr/lib/jvm/java-17-openjdk-amd64 /usr/lib/jvm/java-17-openjdk-amd64
ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
ENV PATH="${JAVA_HOME}/bin:${PATH}"

WORKDIR /app
COPY --from=builder /app /app

EXPOSE 3000
CMD ["node", "server.js"]