# CampusFind web app (student web + admin dashboard), served by nginx.
# Connects to the live Supabase project - see .env.docker.

# ---- Build stage ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# --mode docker makes Vite read .env.docker (public, browser-safe values only)
RUN npx vite build --mode docker

# ---- Serve stage ----
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
