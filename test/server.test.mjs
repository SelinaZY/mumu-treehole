import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createApp } from '../server.mjs';

async function run(t, options = {}) {
  const app = createApp(options);
  app.listen(0, '127.0.0.1');
  await once(app, 'listening');
  t.after(() => new Promise((resolve) => { app.close(resolve); app.closeAllConnections(); }));
  const base = `http://127.0.0.1:${app.address().port}`;
  const post = (body, headers = {}) => fetch(`${base}/api/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Mumu-Request': '1', Origin: base, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { base, post };
}

const secret = 'test-only-not-a-real-credential';
const options = { apiKey: secret, model: 'test-model' };
const rawOutput = (text) => new Response(JSON.stringify({ status: 'completed', output: [
  { type: 'reasoning', summary: [] },
  { type: 'message', content: [{ type: 'output_text', text }] },
] }));
const success = (reply, reaction = 'quiet', allow_playful = false) => rawOutput(JSON.stringify({ reply, reaction, allow_playful }));

test('public demo stays offline even when server credentials exist', async (t) => {
  const { base, post } = await run(t, { ...options, demo: true, fetchImpl: () => { throw new Error('Must not call provider'); } });
  assert.match(await (await fetch(`${base}/config.js`)).text(), /"mode":"demo"/);
  assert.equal((await post({ letter: '今天看到一朵小花。' })).status, 403);
  const config = await readFile(new URL('../public/config.js', import.meta.url), 'utf8');
  assert.match(config, /mode: "demo"/);
});

test('only public assets and readiness are served; local secrets and prompt stay private', async (t) => {
  const { base } = await run(t, options);
  const config = await (await fetch(`${base}/config.js`)).text();
  assert.match(config, /"ready":true/);
  assert.ok(!config.includes(secret));
  for (const path of ['/.env', '/server.mjs', '/prompts/mumu.txt', '/.git/config', '/%2e%2e/.env']) {
    assert.equal((await fetch(base + path)).status, 404, path);
  }
  const status = await new Promise((resolve, reject) => {
    const req = request(base, { headers: { Host: 'foreign.example' } }, (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
    req.end();
  });
  assert.equal(status, 403);
});

test('missing config and malformed or cross-origin input never reach provider', async (t) => {
  const missing = await run(t);
  assert.equal((await missing.post({ letter: '你好' })).status, 503);
  let calls = 0;
  const { post } = await run(t, { ...options, fetchImpl: () => { calls++; return success('你好'); } });
  for (const body of [{ letter: '' }, { letter: ' ' }, { letter: 5 }, { letter: 'a'.repeat(2001) }, '{']) {
    assert.equal((await post(body)).status, 400);
  }
  assert.equal((await post({ letter: '你好' }, { Origin: 'https://other.example' })).status, 403);
  assert.equal((await post({ letter: '你好' }, { 'X-Mumu-Request': '' })).status, 403);
  assert.equal(calls, 0);
});

test('real reply path passes approved prompt, disables response storage and parses message after reasoning', async (t) => {
  let calls = 0;
  const approvedPrompt = await readFile(new URL('../prompts/mumu.txt', import.meta.url), 'utf8');
  const { post } = await run(t, { ...options, fetchImpl: async (url, init) => {
    calls++;
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(init.headers.Authorization, `Bearer ${secret}`);
    const payload = JSON.parse(init.body);
    assert.equal(payload.store, false);
    assert.equal(payload.model, 'test-model');
    assert.ok(payload.instructions.startsWith(approvedPrompt));
    assert.equal(payload.text.format.type, 'json_schema');
    assert.equal(payload.text.format.strict, true);
    assert.equal(payload.text.format.schema.additionalProperties, false);
    assert.deepEqual(payload.input, [{ role: 'user', content: '今天看到一朵小花。' }]);
    return success('小小的一朵，也让今天有了点颜色。');
  } });
  const response = await post({ letter: ' 今天看到一朵小花。 ' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { reply: '小小的一朵，也让今天有了点颜色。', reaction: 'quiet' });
  assert.equal(calls, 1);
});

test('provider errors and incomplete responses are not presented as successful letters', async (t) => {
  for (const upstream of [
    new Response(`private-provider-error-${secret}`, { status: 401 }),
    new Response(JSON.stringify({ status: 'incomplete', output: [] })),
    success(''),
    rawOutput('plain text instead of the requested JSON'),
    rawOutput('{"reaction":"steam"}'),
    rawOutput('{"reply":42}'),
    rawOutput(JSON.stringify({ reply: 'a'.repeat(8001) })),
    new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'not a reply' }] }] })),
  ]) {
    const { post } = await run(t, { ...options, fetchImpl: async () => upstream });
    const response = await post({ letter: '你好' });
    assert.equal(response.status, 502);
    const text = await response.text();
    assert.ok(!text.includes(secret));
    assert.ok(!text.includes('private-provider-error'));
  }
});

test('only explicit playful decisions may animate; other decisions retain the reply and stay quiet', async (t) => {
  for (const [result, expected] of [
    [{ reply: '好烦。', reaction: 'bighead', allow_playful: true }, 'bighead'],
    [{ reply: '好烦。', reaction: 'sweep', allow_playful: true }, 'sweep'],
    [{ reply: '好烦。', reaction: 'steam', allow_playful: true }, 'steam'],
    [{ reply: '我听着。', reaction: 'steam', allow_playful: false }, 'quiet'],
    [{ reply: '我听着。', reaction: 'steam', allow_playful: 'true' }, 'quiet'],
    [{ reply: '我听着。', reaction: 'invented-animation', allow_playful: true }, 'quiet'],
    [{ reply: '我听着。' }, 'quiet'],
  ]) {
    const { post } = await run(t, { ...options, fetchImpl: async () => rawOutput(JSON.stringify(result)) });
    const response = await post({ letter: '一封测试信' });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { reply: result.reply, reaction: expected });
  }
});

test('concurrent requests are rejected and timeout releases the next request', async (t) => {
  let began;
  const started = new Promise((resolve) => { began = resolve; });
  const { post } = await run(t, { ...options, timeoutMs: 80, fetchImpl: async (_, init) => {
    began();
    await new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true }));
  } });
  const pending = post({ letter: '你好' });
  await started;
  assert.equal((await post({ letter: '第二封' })).status, 429);
  assert.equal((await pending).status, 504);
  assert.equal((await post({ letter: '再试一次' })).status, 504);
});
