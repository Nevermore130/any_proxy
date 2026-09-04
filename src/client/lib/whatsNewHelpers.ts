import type { WhatsNewEntry } from "../types.js";

const LAST_SEEN_VERSION_KEY = "rela-capture:last-seen-whats-new-version";
const COMPLETED_TOURS_KEY = "rela-capture:completed-tours";

export function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const parts2 = v2.split(".").map((n) => Number.parseInt(n, 10) || 0);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const part1 = parts1[i] || 0;
    const part2 = parts2[i] || 0;

    if (part1 > part2) {
      return 1;
    }
    if (part1 < part2) {
      return -1;
    }
  }

  return 0;
}

export function getLastSeenVersion(): string | null {
  try {
    return window.localStorage.getItem(LAST_SEEN_VERSION_KEY);
  } catch {
    return null;
  }
}

export function setLastSeenVersion(version: string): void {
  try {
    window.localStorage.setItem(LAST_SEEN_VERSION_KEY, version);
  } catch {
    // Storage persistence is a convenience
  }
}

export function getCompletedTours(): string[] {
  try {
    const json = window.localStorage.getItem(COMPLETED_TOURS_KEY);
    if (!json) {
      return [];
    }
    return JSON.parse(json) as string[];
  } catch {
    return [];
  }
}

export function markTourCompleted(tourId: string): void {
  try {
    const completed = getCompletedTours();
    if (!completed.includes(tourId)) {
      completed.push(tourId);
      window.localStorage.setItem(COMPLETED_TOURS_KEY, JSON.stringify(completed));
    }
  } catch {
    // Storage persistence is a convenience
  }
}

export function isTourCompleted(tourId: string): boolean {
  return getCompletedTours().includes(tourId);
}

export function findUnreadEntry(
  entries: WhatsNewEntry[],
  currentVersion: string
): WhatsNewEntry | null {
  const lastSeenVersion = getLastSeenVersion();

  const unreadEntries = entries.filter((entry) => {
    if (!entry.showModal) {
      return false;
    }
    if (compareVersions(entry.version, currentVersion) > 0) {
      return false;
    }
    if (!lastSeenVersion) {
      return true;
    }
    return compareVersions(entry.version, lastSeenVersion) > 0;
  });

  if (unreadEntries.length === 0) {
    return null;
  }

  unreadEntries.sort((a, b) => compareVersions(b.version, a.version));
  return unreadEntries[0];
}
