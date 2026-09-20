import assert from "node:assert/strict";
import { test } from "node:test";
import {
  guardReportCategories,
  type BriefItem,
  type DailyReport,
} from "../lib/ai/pipeline";

const brief = (url: string, title = url): BriefItem => ({
  title, url, source: "test", summary: "test summary", importance: 5,
});

function report(tech: BriefItem[], finance: BriefItem[], politics: BriefItem[]): DailyReport {
  return {
    hero_headline: "test",
    daily_overview: "test overview",
    tech_briefs: tech,
    finance_briefs: finance,
    politics_briefs: politics,
    editor_note: "test",
    keywords: ["test"],
  };
}

test("keeps only same-category candidates and drops duplicate URLs", () => {
  const candidates = [
    { category: "tech" as const, url: "https://example.com/tech" },
    { category: "finance" as const, url: "https://example.com/finance" },
    { category: "politics" as const, url: "https://example.com/tech" },
  ];
  const guarded = guardReportCategories(
    candidates,
    report(
      [brief("https://example.com/tech")],
      [brief("https://example.com/news"), brief("https://example.com/finance")],
      [brief("https://example.com/tech")],
    ),
  );
  assert.deepEqual(guarded.tech_briefs.map((b) => b.url), ["https://example.com/tech"]);
  assert.deepEqual(guarded.finance_briefs.map((b) => b.url), ["https://example.com/finance"]);
  assert.deepEqual(guarded.politics_briefs, []);
});

test("empties a category with no candidate and keeps unrelated fields", () => {
  const guarded = guardReportCategories(
    [{ category: "tech", url: "https://example.com/tech" }],
    report([brief("https://example.com/tech")], [brief("https://example.com/finance")], []),
  );
  assert.equal(guarded.finance_briefs.length, 0);
  assert.equal(guarded.hero_headline, "test");
});
