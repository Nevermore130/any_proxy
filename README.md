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

## Phone Setup

1. Connect the phone and laptop to the same Wi-Fi.
2. Open the dashboard from the laptop.
3. On the phone Wi-Fi settings, set HTTP proxy to manual.
4. Use the dashboard proxy host and port.
5. On the phone browser, open `http://mitm.it`.
6. Install the mitmproxy CA.
7. Trust the CA in system settings.
8. Open the app or browser traffic you want to inspect.

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
```

Useful API endpoints:

- `GET /api/status`
- `GET /api/flows`
- `GET /api/flows/:id`
- `GET /api/events`
- `POST /api/capture/pause`
- `POST /api/capture/resume`
- `POST /api/flows/clear`
- `GET /api/export`
