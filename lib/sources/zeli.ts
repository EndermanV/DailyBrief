import Parser from 'rss-parser';
import { load } from 'cheerio';
import type { RawArticle, SourceDef } from './types';

export async function fetchZeli(source: SourceDef): Promise<RawArticle[]> {
  const feed = await new Parser({ timeout: 15000 }).parseURL(source.url);
  const latest = feed.items[0];
  if (!latest) throw new Error('Zeli RSS contains no digest');
  const $ = load(latest.content ?? '');
  const articles: RawArticle[] = [];
  const seen = new Set<string>();
  $('li').each((_index, element) => {
    if (articles.length >= 30) return;
    const row = $(element);
    const link = row.find('a').first();
    const url = link.attr('href') ?? '';
    const title = link.text().trim();
    // The feed also includes papers; ingest only the HN story list.
    if (!/^https:\/\/zeli\.app\/zh\/story\/\d+$/.test(url) || !title || seen.has(url)) return;
    const contents = row.contents().toArray();
    const separator = contents.findIndex(node => node.type === 'tag' && node.name === 'br');
    if (separator < 0) return;
    const summary = contents.slice(separator + 1).map(node => $(node).text()).join('').replace(/\s+/g, ' ').trim();
    if (!summary) return;
    seen.add(url);
    articles.push({
      sourceId: source.id, title, url, summary, excerpt: summary.slice(0, 300),
      category: source.category,
      publishedAt: latest.isoDate ? new Date(latest.isoDate) : undefined,
    });
  });
  if (!articles.length) throw new Error('Zeli digest contains no recognizable HN stories');
  return articles;
}
