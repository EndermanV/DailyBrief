import assert from 'node:assert/strict';
import http from 'node:http';
import { test } from 'node:test';
import { fetchSource } from '../lib/sources/dispatch';

test('Zeli expands the latest digest into individual Chinese HN summaries', async () => {
  const xml = `<rss version="2.0"><channel><title>Zeli</title>
    <item><title>Latest digest</title><pubDate>Wed, 16 Sep 2026 23:59:59 GMT</pubDate>
    <description><![CDATA[<ol>
      <li><a href="https://zeli.app/zh/story/123">First story</a> votes <a href="https://news.ycombinator.com/item?id=123">comments</a><br/>Complete <b>summary</b>.</li>
      <li><a href="https://zeli.app/zh/story/123">Duplicate</a><br/>Repeated.</li>
      <li><a href="https://zeli.app/zh/story/456">Second story</a><br/>Second summary.</li>
      <li><a href="https://zeli.app/zh/paper/123">Paper</a><br/>Paper summary.</li>
    </ol>]]></description></item>
    <item><title>Old digest</title><description><![CDATA[<li><a href="https://zeli.app/zh/story/789">Old story</a><br/>Old summary.</li>]]></description></item>
  </channel></rss>`;
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/rss+xml' });
    res.end(xml);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address() as import('node:net').AddressInfo;
    const articles = await fetchSource({ id: 'zeli', name: 'Zeli', type: 'rss', category: 'tech', url: `http://127.0.0.1:${address.port}` });
    assert.deepEqual(articles.map(a => a.title), ['First story', 'Second story']);
    assert.equal(articles[0].summary, 'Complete summary.');
    assert.equal(articles[0].url, 'https://zeli.app/zh/story/123');
    assert.equal(articles[0].publishedAt?.toISOString(), '2026-09-16T23:59:59.000Z');
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
