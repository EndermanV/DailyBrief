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
    await writeFile(path.join(dir, `${date}.md`), '# Daily brief\n\nToday only');
    let result = await run(date);
    assert.equal(result.code, 0, result.output);
    assert.equal(messages.length, 1, 'must read daily_reports/<date>/<date>.md and send');
    assert.equal(messages[0].msg_type, 'interactive');
    assert.match(messages[0].card.elements[0].text.content, /Today only/);
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
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(cwd, { recursive: true, force: true });
  }
});
