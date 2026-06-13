import type { CapturedFlow, FlowFilters } from "./types.js";

export function flowMatchesFilters(flow: CapturedFlow, filters: FlowFilters): boolean {
  if (filters.deviceIp && !flow.clientIp.includes(filters.deviceIp.trim())) {
    return false;
  }

  if (filters.host && !flow.host.toLowerCase().includes(filters.host.trim().toLowerCase())) {
    return false;
  }

  if (filters.protocol && filters.protocol !== "all" && flow.protocol !== filters.protocol) {
    return false;
  }

  if (filters.statusClass && filters.statusClass !== "all") {
    if (filters.statusClass === "none") {
      return flow.statusCode === undefined;
    }

    if (flow.statusCode === undefined) {
      return false;
    }

    const lowerBound = Number(filters.statusClass[0]) * 100;
    return flow.statusCode >= lowerBound && flow.statusCode < lowerBound + 100;
  }

  return true;
}
