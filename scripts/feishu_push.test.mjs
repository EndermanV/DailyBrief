import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

test('pushes the dated report and rejects webhook failures or missing reports', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'brief-feishu-'));
  let reply = { code: 0 };
  let status = 200;
  const messages = [];
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    messages.push(JSON.parse(body));
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(reply));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const run = (date) => new Promise(resolve => {
    const child = spawn(process.execPath, [path.join(root, 'node_modules/tsx/dist/cli.mjs'),
      path.join(root, 'scripts/feishu_push.js'), date], {
      cwd, env: { ...process.env, FEISHU_WEBHOOK: `http://127.0.0.1:${server.address().port}` },
    });
    let output = '';
    child.stdout.on('data', chunk => output += chunk);
    child.stderr.on('data', chunk => output += chunk);
    child.on('close', code => resolve({ code, output }));
  });
  try {
    const date = '2026-09-17';
    const dir = path.join(cwd, 'daily_reports', date);
    await mkdir(dir, { recursive: true });
    const report = {
      hero_headline: 'Today headline', daily_overview: 'Today only',
      tech_briefs: [{ title: 'Technology', summary: 'Full technology summary', source: 'Source', url: 'https://example.com/tech' }],
      finance_briefs: [],
      politics_briefs: [{ title: 'Complete politics title', summary: 'Complete politics summary', source: 'News', url: 'https://example.com/politics' }],
      editor_note: 'Editor perspective', keywords: ['AI', 'Markets'],
    };
    await writeFile(path.join(dir, `${date}.json`), JSON.stringify(report));
    let result = await run(date);
    assert.equal(result.code, 0, result.output);
    assert.equal(messages.length, 1, 'must read the JSON digest and send a self-contained card');
    assert.equal(messages[0].msg_type, 'interactive');
    const card = JSON.stringify(messages[0]);
    for (const value of ['Today only', 'Complete politics title', 'Complete politics summary', 'Editor perspective', 'https://example.com/politics']) {
      assert.ok(card.includes(value), `card must include ${value}`);
    }
    assert.doesNotMatch(card, /HTML|已截断/);
    assert.ok(messages[0].card.elements.some(element => element.tag === 'hr'));
    assert.ok(messages[0].card.elements.some(element => element.text?.tag === 'lark_md' && element.text.content === '**01 · Technology**'));
    assert.ok(messages[0].card.elements.some(element => element.tag === 'note' && element.elements[0].content === 'Source'));
    assert.equal(messages[0].card.header.subtitle.content, date);
    reply = { code: 19024, msg: 'keyword missing' };
    result = await run(date);
    assert.equal(result.code, 1, 'HTTP 200 with a Feishu error must fail');
    reply = { StatusCode: 0, StatusMessage: 'success' };
    assert.equal((await run(date)).code, 0);
    status = 500;
    assert.equal((await run(date)).code, 1);
    const count = messages.length;
    assert.equal((await run('2026-09-18')).code, 1, 'missing report must fail');
    assert.equal(messages.length, count, 'must not send an older report');
    status = 200;
    report.politics_briefs = Array.from({ length: 25 }, (_, i) => ({
      title: `Politics ${i}`, summary: '完整摘要。'.repeat(180), source: 'News', url: `https://example.com/${i}`,
    }));
    await writeFile(path.join(dir, `${date}.json`), JSON.stringify(report));
    const start = messages.length;
    result = await run(date);
    assert.equal(result.code, 0, result.output);
    const pages = messages.slice(start);
    assert.ok(pages.length > 1, 'large reports must be split without truncation');
    for (const page of pages) assert.ok(Buffer.byteLength(JSON.stringify(page)) <= 24000);
    const content = pages.flatMap(page => page.card.elements).map(element => element.text?.content || '').join('\n');
    for (const brief of report.politics_briefs) {
      assert.ok(content.includes(brief.title));
      assert.ok(content.includes(brief.summary));
    }
    report.politics_briefs = [{ title: 'Long story', summary: 'Long complete sentence. '.repeat(1000), source: 'News', url: 'javascript:alert(1)' }];
    await writeFile(path.join(dir, `${date}.json`), JSON.stringify(report));
    const longStart = messages.length;
    assert.equal((await run(date)).code, 0);
    const longCards = messages.slice(longStart);
    const longContent = longCards.flatMap(page => page.card.elements).map(element => element.text?.content || '').join('');
    assert.ok(longContent.includes(report.politics_briefs[0].summary), 'long fields must survive splitting intact');
    assert.doesNotMatch(JSON.stringify(longCards), /javascript:/);
    for (const card of longCards) assert.ok(Buffer.byteLength(JSON.stringify(card)) <= 24000);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(cwd, { recursive: true, force: true });
  }
});
