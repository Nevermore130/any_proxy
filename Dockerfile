FROM node:22-trixie-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:22-trixie-slim AS runtime
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates \
  && python3 -m venv /opt/mitmproxy \
  && /opt/mitmproxy/bin/pip install --no-cache-dir mitmproxy==12.2.3 \
  && apt-get purge -y --auto-remove python3-venv \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PATH="/opt/mitmproxy/bin:${PATH}"
ENV RELA_CAPTURE_DASHBOARD_HOST=0.0.0.0
ENV RELA_CAPTURE_DASHBOARD_PORT=5177
ENV RELA_CAPTURE_PROXY_HOST=0.0.0.0
ENV RELA_CAPTURE_PROXY_PORT=8088
ENV RELA_CAPTURE_MITMPROXY_BLOCK_GLOBAL=false
ENV RELA_CAPTURE_MAX_FLOWS=5000
ENV RELA_CAPTURE_BODY_PREVIEW_BYTES=32768
ENV RELA_CAPTURE_FLOW_TTL_SECONDS=600

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY public ./public
COPY scripts ./scripts

RUN mkdir -p /app/.mitmproxy && chown -R node:node /app/.mitmproxy
VOLUME ["/app/.mitmproxy"]

EXPOSE 5177 8088
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.RELA_CAPTURE_DASHBOARD_PORT || '5177') + '/api/status').then(async (r) => { if (!r.ok) process.exit(1); const status = await r.json(); process.exit(status.mitmproxy?.running === true ? 0 : 1); }).catch(() => process.exit(1))"

USER node

CMD ["npm", "run", "start:prod"]
