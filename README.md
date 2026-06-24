# Rela Capture

Rela Capture is an App relay capture service for internal Rela app testing. The app points its debug API base URL at this service, the service forwards requests to the configured upstream API origin, and the dashboard records request/response metadata and body previews.

This project no longer runs a phone system proxy, mitmproxy, CA certificate installer, QR onboarding page, or iOS proxy profile. It only captures traffic that the app explicitly sends through `/relay/rela`.

## Requirements

- Node.js 22 or newer
- npm 10 or newer

## Start

```bash
npm install
npm run build:client
npm run dev
```

For a non-watch run, use:

```bash
npm run start
```

The dashboard is a React/Vite app. `npm run build:client` writes the dashboard bundle to
`dist/public`, and the Express service serves that directory before the legacy `public`
fallback. For a full production build, use:

```bash
npm run build
```

The terminal prints:

- dashboard URL
- Rela App relay URL

Default dashboard port:

- `5177`

## Rela App Relay

Set the Rela app debug API base URL to:

```text
http://<host>:5177/relay/rela
```

When the relay is exposed through a public HTTP tunnel or reverse proxy that already maps
port 80 to this service, use that public URL directly:

```text
http://anyproxy.cpolar.top/relay/rela
```

The app sends the original Rela API host in this header while relay mode is active:

```text
X-Rela-Original-Host: api.rela.me
```

For example, if the app calls:

```text
http://<host>:5177/relay/rela/v1/me?debug=1
```

with `X-Rela-Original-Host: test-api.rela.me`, the relay forwards it to:

```text
https://test-api.rela.me/v1/me?debug=1
```

The relay returns the upstream response to the app and records the exchange in the dashboard.
The normal HTTP `Host` header should stay as the relay service host, such as
`anyproxy.cpolar.top`; it is not used for upstream routing.

`RELA_RELAY_TARGET_ORIGIN` is the fallback upstream origin when
`X-Rela-Original-Host` is missing or not in the supported Rela host list:

```bash
RELA_RELAY_TARGET_ORIGIN=https://api.rela.me
```

## Docker Deployment

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and set:

```bash
RELA_CAPTURE_ADVERTISE_HOST=<server-public-ip-or-domain>
RELA_RELAY_TARGET_ORIGIN=https://api.rela.me
```

For direct CVM access on port `5177`, use the CVM IP or an explicit host with port, such as
`111.229.187.209` or `capture.example.com:5177`. The generated relay URL will include
`:5177`.

For a public tunnel/reverse proxy that exposes HTTP on port 80, use the public domain without
`:5177`, such as `anyproxy.cpolar.top`. The generated dashboard QR payload will use:

```text
http://anyproxy.cpolar.top/relay/rela
```

Start:

```bash
docker compose up -d --build
```

Check the deployment from the server:

```bash
docker compose ps
curl http://127.0.0.1:5177/api/status
```

Open:

```text
http://<server-public-ip-or-domain>:5177
```

Use this Rela App relay endpoint:

```text
http://<server-public-ip-or-domain>:5177/relay/rela
```

If you use a tunnel domain such as `anyproxy.cpolar.top`, open the tunnel URL and use the relay
URL shown by the dashboard QR payload instead of manually adding `:5177`.

## Tencent Cloud CVM Notes

1. Install Docker and the Docker Compose plugin on the CVM.
2. Open inbound TCP port `5177` in the Tencent Cloud security group.
3. Set `RELA_CAPTURE_ADVERTISE_HOST` to the CVM public IP or DNS name.
4. Start with `docker compose up -d --build`.
5. Configure the Rela app debug API base URL as `http://<server-public-ip-or-domain>:5177/relay/rela`.

### Public Dashboard Warning

This deployment does not add token authentication or IP whitelisting yet. If port `5177` is open to the internet, anyone who discovers it may view captured traffic, call dashboard APIs, and send requests through the relay. Limit the Tencent Cloud security group to trusted test networks when possible, and add IP whitelist support in a follow-up iteration.

## HTTPS Notes

The app connects to the relay endpoint you configure. The relay can forward to an HTTPS upstream such as `https://api.rela.me` and record the plaintext request/response at the relay boundary.

If the app must connect to the relay over HTTPS too, put this service behind an HTTPS reverse proxy or load balancer and set the app debug API base URL to that HTTPS domain.

## Troubleshooting

- No requests appear: confirm the app debug API base URL is set to `/relay/rela`.
- The app cannot reach the relay: check the server IP/domain, port `5177`, Tencent Cloud security group, and local firewall.
- Tunnel domain cannot route requests: confirm `RELA_CAPTURE_ADVERTISE_HOST` is set to the
  public tunnel domain without `:5177`, and confirm the app sends `X-Rela-Original-Host`.
- Relay returns `502`: check `RELA_RELAY_TARGET_ORIGIN` and whether the server can reach the upstream API.
- Dashboard shows only recent requests: expired flows are cleaned automatically according to `RELA_CAPTURE_FLOW_TTL_SECONDS`.

## Configuration

```bash
RELA_CAPTURE_DASHBOARD_HOST=0.0.0.0
RELA_CAPTURE_DASHBOARD_PORT=5177
RELA_CAPTURE_ADVERTISE_HOST=<server-public-ip-or-domain>
RELA_RELAY_TARGET_ORIGIN=https://api.rela.me
RELA_CAPTURE_MAX_FLOWS=5000
RELA_CAPTURE_BODY_PREVIEW_BYTES=32768
RELA_CAPTURE_FLOW_TTL_SECONDS=600
```

`RELA_CAPTURE_FLOW_TTL_SECONDS=600` keeps captured requests for 10 minutes. Expired flows are removed automatically, and `RELA_CAPTURE_MAX_FLOWS` still caps the total retained request count.

Useful API endpoints:

- `GET /api/status`
- `GET /api/flows`
- `GET /api/flows/:id`
- `GET /api/events`
- `POST /api/capture/pause`
- `POST /api/capture/resume`
- `POST /api/flows/clear`
- `GET /api/export`
- `ANY /relay/rela/*`
