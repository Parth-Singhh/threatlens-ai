import type { Incident } from "./types";

export const CLOSED_STATUSES = ["resolved", "closed"];
export const IN_PROGRESS_STATUSES = ["assigned", "investigating", "escalated", "waiting"];
export const PRIORITY_RANK: Record<string, number> = { p1: 0, p2: 1, p3: 2, p4: 3 };

export const isOpen = (incident: Incident) => !CLOSED_STATUSES.includes(incident.status);

/** Same detail parsing the original handlers used for FastAPI error bodies. */
export function extractDetail(detail: unknown): string | null {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item: { msg?: string }) => item?.msg ?? "Invalid input")
      .join(" ");
  }
  return null;
}

export function titleCase(value: string) {
  const text = value.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Only allow plain http(s) links for user-supplied evidence references. */
export function safeHref(value: string | null) {
  return value && /^https?:\/\//i.test(value.trim()) ? value.trim() : null;
}

export function dailyCounts(incidents: Incident[], days = 14) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const values: number[] = Array(days).fill(0);
  const labels: string[] = [];
  for (let i = 0; i < days; i += 1) {
    const day = new Date(today);
    day.setDate(today.getDate() - (days - 1 - i));
    labels.push(day.toLocaleDateString(undefined, { month: "short", day: "numeric" }));
  }
  for (const incident of incidents) {
    const created = new Date(incident.created_at);
    created.setHours(0, 0, 0, 0);
    const diff = Math.round((today.getTime() - created.getTime()) / 86_400_000);
    if (diff >= 0 && diff < days) values[days - 1 - diff] += 1;
  }
  return { values, labels };
}

export function countBy<T>(items: T[], key: (item: T) => string): [string, number][] {
  const map = new Map<string, number>();
  for (const item of items) map.set(key(item), (map.get(key(item)) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

export function relativeTime(iso: string) {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 86_400 * 30) return `${Math.floor(seconds / 86_400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Weighted open-queue load, computed only from the loaded incidents. */
export function pressureIndex(incidents: Incident[]) {
  let score = 0;
  for (const incident of incidents) {
    if (!isOpen(incident)) continue;
    score += { p1: 22, p2: 9, p3: 3, p4: 1 }[incident.priority] ?? 0;
    if (incident.assigned_analyst_id === null) score += 2;
  }
  return Math.min(100, score);
}
