# Rela Capture

Rela Capture is a local phone traffic capture tool for internal app testing. It starts a local dashboard and a mitmproxy HTTP proxy. Put a phone and the laptop on the same Wi-Fi, set the phone Wi-Fi proxy to the laptop address, trust the mitmproxy CA, and inspect traffic in the dashboard.

## Requirements

- Node.js 22 or newer
- npm 10 or newer
- mitmproxy installed locally

Install mitmproxy on macOS with one of these commands:

```bash
brew install mitmproxy
```

```bash
pipx install mitmproxy
```

If `mitmdump` is installed outside PATH, set:

```bash
export RELA_CAPTURE_MITMDUMP_BIN=/absolute/path/to/mitmdump
```

If `mitmdump` is missing, the dashboard still starts and reports setup guidance in the terminal and status API, but proxy capture will not run until mitmproxy is available.

## Start

```bash
npm install
npm run dev
```

For a non-watch run, use:

```bash
npm run start
```

The terminal prints:

- dashboard URL
- phone proxy host and port
- certificate install page

Default ports:

- dashboard: `5177`
- proxy: `8088`

## Docker Deployment

The Docker image bundles Node.js and mitmproxy. This is the recommended path for Tencent Cloud CVM deployment.

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and set:

```bash
RELA_CAPTURE_ADVERTISE_HOST=<server-public-ip-or-domain>
RELA_RELAY_TARGET_ORIGIN=https://api.rela.me
```

Start:

```bash
docker compose up -d --build
```

Check the deployment from the CVM:

```bash
docker compose ps
curl http://127.0.0.1:5177/api/status
```

The status response should include `"running":true` under `mitmproxy`.

Open:

```text
http://<server-public-ip-or-domain>:5177
```

Docker Compose stores mitmproxy CA files in the named volume `mitmproxy-ca`. Keeping this volume means phones that already trusted the generated CA usually do not need to reinstall it after container restarts.

## Tencent Cloud CVM Notes

1. Install Docker and the Docker Compose plugin on the CVM.
2. Open inbound TCP ports `5177` and `8088` in the Tencent Cloud security group, limited to trusted tester IP ranges when possible.
3. Set `RELA_CAPTURE_ADVERTISE_HOST` to the CVM public IP or DNS name.
4. Start with `docker compose up -d --build`.
5. Use this Rela App relay endpoint:

```text
http://<server-public-ip-or-domain>:5177/relay/rela
```

For full phone system proxy capture, configure the phone HTTP proxy host to the same public IP or DNS name and port `8088`, then open `http://mitm.it` on the phone and trust the mitmproxy CA.

### Public Proxy Warning

This first Docker deployment does not add token authentication or IP whitelisting. If port `5177` is open to the internet, anyone who discovers it may view captured traffic and call dashboard APIs. If port `8088` is open to the internet, anyone who discovers it may attempt to use it as an HTTP proxy. Limit the Tencent Cloud security group to trusted test networks when possible, and add IP whitelist support in a follow-up iteration.

## Phone Setup

1. Connect the phone and laptop to the same Wi-Fi.
2. Open the dashboard from the laptop.
3. Scan the QR code in the dashboard to open the mobile setup page, or open `http://<laptop-ip>:5177/mobile-setup` manually.
4. On the phone Wi-Fi settings, set HTTP proxy to manual.
5. Use the dashboard proxy host and port.
6. On the phone browser, open `http://mitm.it`.
7. Install the mitmproxy CA.
8. Trust the CA in system settings.
9. Open the app or browser traffic you want to inspect.

The mobile setup page also links to an iOS proxy configuration profile. Some iOS devices require supervised mode for the global proxy payload, so manual Wi-Fi proxy setup remains the reliable fallback.

## Rela App Relay

For app-only API debugging, the Rela App can skip system proxy setup and point its debug API base URL at the local relay:

```text
http://<laptop-ip>:5177/relay/rela
```

By default, the relay forwards requests to:

```text
https://api.rela.me
```

For example, an app request to:

```text
http://<laptop-ip>:5177/relay/rela/v1/me?debug=1
```

is forwarded to:

```text
https://api.rela.me/v1/me?debug=1
```

The relay returns the upstream response to the app and records the request and response in the dashboard. This mode only captures traffic that the app explicitly sends through the relay.

Override the target origin when needed:

```bash
RELA_RELAY_TARGET_ORIGIN=https://api.rela.me
```

## HTTPS Notes

HTTPS body capture requires the phone to trust the mitmproxy CA.

iOS app traffic often works after the CA is trusted, unless the app uses certificate pinning.

Android app traffic on Android 7 or newer usually needs the debug build to trust user-added CAs through `network_security_config`.

Apps with certificate pinning need a debug switch that disables pinning or trusts the debugging CA.

HTTP/3 and QUIC use UDP and may bypass this HTTP proxy path. Disable QUIC in the test environment or block UDP 443 when needed.

## Troubleshooting

- No requests appear: confirm the phone and laptop are on the same Wi-Fi.
- Phone cannot reach proxy: check Wi-Fi client isolation, firewall prompts, proxy host, and proxy port.
- HTTPS errors appear: confirm the CA is installed and trusted.
- Android app HTTPS is blank or fails: confirm the debug app trusts user CAs.
- Startup says `mitmdump was not found`: install mitmproxy or set `RELA_CAPTURE_MITMDUMP_BIN`.

## Configuration

```bash
RELA_CAPTURE_DASHBOARD_HOST=0.0.0.0
RELA_CAPTURE_DASHBOARD_PORT=5177
RELA_CAPTURE_PROXY_HOST=0.0.0.0
RELA_CAPTURE_PROXY_PORT=8088
RELA_CAPTURE_MAX_FLOWS=2000
RELA_CAPTURE_BODY_PREVIEW_BYTES=65536
RELA_CAPTURE_MITMDUMP_BIN=/absolute/path/to/mitmdump
RELA_CAPTURE_ADVERTISE_HOST=<server-public-ip-or-domain>
RELA_CAPTURE_MITMPROXY_BLOCK_GLOBAL=true
RELA_RELAY_TARGET_ORIGIN=https://api.rela.me
```

`RELA_CAPTURE_MITMPROXY_BLOCK_GLOBAL=true` keeps mitmproxy's local default of blocking public IP clients. Docker Compose sets it to `false` so phones can reach the proxy through a Tencent Cloud public IP.

Useful API endpoints:

- `GET /api/status`
- `GET /api/onboarding`
- `GET /api/onboarding/qr.svg`
- `GET /api/flows`
- `GET /api/flows/:id`
- `GET /api/events`
- `POST /api/capture/pause`
- `POST /api/capture/resume`
- `POST /api/flows/clear`
- `GET /api/export`
- `ANY /relay/rela/*`
- `GET /mobile-setup`
- `GET /profiles/ios-proxy.mobileconfig`
