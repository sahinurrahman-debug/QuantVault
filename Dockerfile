# QuantVault: React client + Express API + Python (Qiskit) engines in a single image.

# ---- build the React client
FROM node:22-bookworm-slim AS client
WORKDIR /build
COPY web/client/package*.json ./
RUN npm ci
COPY web/client/ ./
RUN npm run build

# ---- runtime: Node (API) + Python (engines)
FROM node:22-bookworm-slim
ENV NODE_ENV=production PYTHONUNBUFFERED=1 PYTHON_CONCURRENCY=1
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# Only the packages the engines need (not the optional qiskit-nature add-on). The API finds /app/.venv itself.
RUN python3 -m venv .venv \
    && .venv/bin/pip install --no-cache-dir "qiskit>=1.0,<2.0" "qiskit-aer>=0.15" numpy scipy pandas
COPY src ./src
COPY data/inventory.json ./data/inventory.json
COPY web/server/package*.json ./web/server/
RUN cd web/server && npm ci --omit=dev
COPY web/server/src ./web/server/src
COPY --from=client /build/dist ./web/client/dist
WORKDIR /app/web/server
# Render injects PORT; the server reads it (default 5000 locally).
CMD ["node", "src/index.js"]
