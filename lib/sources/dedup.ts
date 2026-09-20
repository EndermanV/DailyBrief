import fs from "node:fs";
import path from "node:path";
import type { RawArticle, SourceDef } from "./types";

/** Directory that holds each day's `daily_reports/<date>/<date>-articles.json`. */
const OUTPUT_DIR = "daily_reports";

/** Parse a `YYYY-MM-DD` report-directory key; null if not well-formed. */
function parseDateKey(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/**
 * Whole calendar days between a sidecar's date key and today's date key.
 * Date keys are day-resolved (no TZ ambiguity), so compare them in UTC.
 */
function daysBefore(thenKey: string, todayKeyStr: string): number {
  const a = parseDateKey(thenKey);
  const b = parseDateKey(todayKeyStr);
  if (!a || !b) return Number.POSITIVE_INFINITY;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * Build `sourceId -> Set<url>` for items already shown on recent days, so a
 * daily run can suppress repeat content. Rolling / heat-ranked sources
 * (GitHub Trending, HF trending papers, attentionvc X viral) persist the same
 * items across consecutive runs, which would otherwise clutter every report.
 *
 * Only sources with `dedupDays > 0` participate. Reads the article sidecars
 * `daily_reports/<date>/<date>-articles.json` for every prior day within each
 * source's window and collects their URLs keyed by sourceId. Today's own
 * partial file (and any future-dated dirs) is skipped.
 *
 * Returns an empty map when there is no report history yet — a fresh fork.
 */
export function loadSeenUrls(
  sources: SourceDef[],
  todayDate: string,
): Map<string, Set<string>> {
  const windows = new Map<string, number>();
  for (const s of sources) {
    if (s.enabled === false || !s.dedupDays) continue;
    windows.set(s.id, s.dedupDays);
  }
  const seen = new Map<string, Set<string>>();
  for (const id of windows.keys()) seen.set(id, new Set());

  let dirs: string[];
  try {
    dirs = fs
      .readdirSync(OUTPUT_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory() && parseDateKey(e.name))
      .map((e) => e.name);
  } catch {
    return seen; // no history yet
  }

  for (const d of dirs) {
    const days = daysBefore(d, todayDate);
    if (!isFinite(days) || days <= 0) continue; // skip today + future + bad names
    const sidecar = path.join(OUTPUT_DIR, d, `${d}-articles.json`);
    let json: unknown;
    try {
      json = JSON.parse(fs.readFileSync(sidecar, "utf8"));
    } catch {
      continue; // missing/unreadable/partial sidecar — ignore
    }
    const arts = (json as { articles?: RawArticle[] })?.articles ?? [];
    for (const a of arts) {
      const window = windows.get(a.sourceId);
      if (!window) continue; // source not dedup-enabled, or its file was removed
      if (a.url && days <= window) seen.get(a.sourceId)!.add(a.url);
    }
  }
  return seen;
}

/**
 * Drop items of `source` whose URL already appeared on a previous day within
 * its dedup window. Non-dedup sources (or no history) pass through untouched.
 */
export function dedupItems(
  source: SourceDef,
  items: RawArticle[],
  seenBySource: Map<string, Set<string>>,
): { kept: RawArticle[]; dropped: number } {
  const seen = source.dedupDays ? seenBySource.get(source.id) : undefined;
  if (!seen || seen.size === 0) return { kept: items, dropped: 0 };
  const kept = items.filter((it) => !it.url || !seen.has(it.url));
  return { kept, dropped: items.length - kept.length };
}