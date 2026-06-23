export function compactRelayUrl(value: string): string {
  if (!value) {
    return "";
  }

  if (value.startsWith("/")) {
    return value;
  }

  try {
    const parsed = new URL(value);
    return `${parsed.host}${parsed.pathname}${parsed.search}`;
  } catch {
    return value.replace(/^https?:\/\//i, "");
  }
}
