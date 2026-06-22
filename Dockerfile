FROM node:22-trixie-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM deps AS build
COPY tsconfig.json tsconfig.build.json vite.config.ts ./
COPY src ./src
COPY public ./public
RUN npm run build

FROM node:22-trixie-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV RELA_CAPTURE_DASHBOARD_HOST=0.0.0.0
ENV RELA_CAPTURE_DASHBOARD_PORT=5177
ENV RELA_CAPTURE_MAX_FLOWS=5000
ENV RELA_CAPTURE_BODY_PREVIEW_BYTES=32768
ENV RELA_CAPTURE_FLOW_TTL_SECONDS=600

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

EXPOSE 5177
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.RELA_CAPTURE_DASHBOARD_PORT || '5177') + '/api/status').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

USER node

CMD ["npm", "run", "start:prod"]
