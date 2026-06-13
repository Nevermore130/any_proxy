import base64
import json
import time
from typing import Any

from mitmproxy import http

PREFIX = "RELA_CAPTURE_EVENT "
MAX_BODY_BYTES = 262144


def header_pairs(headers: Any) -> list[list[str]]:
    return [[str(name), str(value)] for name, value in headers.items(multi=True)]


def is_textual_content_type(content_type: str) -> bool:
    normalized = content_type.lower()
    return (
        normalized.startswith("text/")
        or "json" in normalized
        or "xml" in normalized
        or "javascript" in normalized
        or "x-www-form-urlencoded" in normalized
    )


def body_payload(message: Any) -> tuple[str | None, str]:
    raw = getattr(message, "raw_content", None)
    if raw is None:
        return None, "text"

    limited = raw[:MAX_BODY_BYTES]
    content_type = message.headers.get("content-type", "")
    if is_textual_content_type(content_type):
        return limited.decode("utf-8", errors="replace"), "text"

    return base64.b64encode(limited).decode("ascii"), "base64"


def protocol_for(flow: http.HTTPFlow) -> str:
    if flow.websocket is not None:
        return "websocket"
    if flow.request.scheme == "https":
        return "https"
    if flow.request.scheme == "http":
        return "http"
    return "unknown"


def request_start_epoch_ms(flow: http.HTTPFlow) -> int:
    started_at = flow.request.timestamp_start
    return int((started_at if started_at is not None else time.time()) * 1000)


def duration_ms(flow: http.HTTPFlow, ended_at: float | None = None) -> int:
    started_at = flow.request.timestamp_start
    start = started_at if started_at is not None else time.time()
    end = ended_at if ended_at is not None else time.time()
    return max(0, int((end - start) * 1000))


def base_flow(flow: http.HTTPFlow) -> dict[str, Any]:
    request_body, request_body_encoding = body_payload(flow.request)
    payload: dict[str, Any] = {
        "id": flow.id,
        "clientIp": flow.client_conn.peername[0] if flow.client_conn.peername else "unknown",
        "startedAtEpochMs": request_start_epoch_ms(flow),
        "protocol": protocol_for(flow),
        "method": flow.request.method,
        "scheme": flow.request.scheme,
        "host": flow.request.pretty_host,
        "port": flow.request.port,
        "path": flow.request.path,
        "requestHeaders": header_pairs(flow.request.headers),
        "requestBody": request_body,
        "requestBodyEncoding": request_body_encoding,
        "requestContentType": flow.request.headers.get("content-type", ""),
        "isTlsIntercepted": flow.request.scheme == "https",
    }

    return payload


def emit(event_type: str, payload: dict[str, Any]) -> None:
    event = {"eventType": event_type, "flow": payload}
    print(PREFIX + json.dumps(event, ensure_ascii=False), flush=True)


class RelaCaptureAddon:
    def request(self, flow: http.HTTPFlow) -> None:
        emit("request", base_flow(flow))

    def response(self, flow: http.HTTPFlow) -> None:
        payload = base_flow(flow)
        if flow.response is not None:
            response_body, response_body_encoding = body_payload(flow.response)
            payload.update(
                {
                    "durationMs": duration_ms(flow, flow.response.timestamp_end),
                    "statusCode": flow.response.status_code,
                    "responseHeaders": header_pairs(flow.response.headers),
                    "responseBody": response_body,
                    "responseBodyEncoding": response_body_encoding,
                    "responseContentType": flow.response.headers.get("content-type", ""),
                }
            )
        emit("response", payload)

    def error(self, flow: http.HTTPFlow) -> None:
        payload = base_flow(flow)
        payload["durationMs"] = duration_ms(flow)
        payload["error"] = flow.error.msg if flow.error is not None else "unknown proxy error"
        emit("error", payload)

    def websocket_message(self, flow: http.HTTPFlow) -> None:
        payload = base_flow(flow)
        payload["durationMs"] = duration_ms(flow)
        emit("websocket", payload)


addons = [RelaCaptureAddon()]
