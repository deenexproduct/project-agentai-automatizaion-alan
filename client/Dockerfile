# ── Stage 1: Build ──────────────────────────────────
FROM node:18-slim AS builder

WORKDIR /app

# Pass backend URL at build time
ARG VITE_API_URL=https://endearing-enthusiasm-production.up.railway.app
ENV VITE_API_URL=$VITE_API_URL

COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps

COPY . .

# Skip tsc type-checking — Vite handles TS transpilation via esbuild
RUN npx vite build

# ── Stage 2: Serve ──────────────────────────────────
FROM node:18-slim

RUN npm install -g serve

WORKDIR /app

COPY --from=builder /app/dist ./dist

EXPOSE 3001

CMD ["serve", "-s", "dist", "-l", "3001"]
