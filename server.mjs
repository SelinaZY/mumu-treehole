import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const publicDir = new URL('./public/', import.meta.url);
const prompt = await readFile(new URL('./prompts/mumu.txt', import.meta.url), 'utf8');
const reactionPrompt = await readFile(new URL('./prompts/reaction.txt', import.meta.url), 'utf8');
const reactionNames = ['quiet', 'bighead', 'sweep', 'steam'];
const replyFormat = {
  type: 'json_schema', name: 'mumu_letter', strict: true,
  schema: {
    type: 'object', additionalProperties: false,
    properties: {
      reply: { type: 'string' },
      allow_playful: { type: 'boolean' },
      reaction: { type: 'string', enum: reactionNames },
    },
    required: ['reply', 'allow_playful', 'reaction'],
  },
};
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/reactions.js', ['reactions.js', 'text/javascript; charset=utf-8']],
  ['/storage.js', ['storage.js', 'text/javascript; charset=utf-8']],
]);

class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function readLetter(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16384) throw new RequestError(413, '这封信太长了，请缩短到 2000 字符以内。');
    chunks.push(chunk);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new RequestError(400, '信件格式有误，请重新寄出。'); }
  if (typeof body?.letter !== 'string' || !body.letter.trim() || body.letter.length > 2000) {
    throw new RequestError(400, '请写下 1–2000 字符的内容。');
  }
  return body.letter.trim();
}

export function createApp({ apiKey = '', model = '', demo = false, fetchImpl = fetch, timeoutMs = 60000 } = {}) {
  let inFlight = false;
  const ready = Boolean(apiKey.trim() && model.trim());
  return createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    const send = (status, data) => {
      if (res.destroyed) return;
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    };
    try {
      // Reject foreign Host values as well as cross-origin browser requests.
      const port = req.socket.localPort;
      const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
      if (!hosts.has(req.headers.host)) return send(403, { error: '仅允许从本机访问。' });
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname === '/api/reply') {
        if (req.method !== 'POST') return send(405, { error: '请使用寄信按钮提交。' });
        if (demo) return send(403, { error: '演示模式不会调用 API。' });
        const origin = req.headers.origin;
        if (req.headers['x-mumu-request'] !== '1' ||
            req.headers['content-type']?.split(';')[0].trim() !== 'application/json' ||
            (origin && origin !== `http://${req.headers.host}`) ||
            (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin')) {
          return send(403, { error: '请从本地木木页面寄出信件。' });
        }
        if (!ready) return send(503, { error: '请在本地 .env 配置 API Key 和模型，再重启木木。' });
        if (inFlight) return send(429, { error: '木木还在读上一封信，稍等一会儿。' });
        inFlight = true;
        const abort = new AbortController();
        const cancel = () => { if (!res.writableEnded) abort.abort(); };
        res.on('close', cancel);
        let timer;
        try {
          const letter = await readLetter(req);
          timer = setTimeout(() => abort.abort(), timeoutMs);
          const upstream = await fetchImpl('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model,
              instructions: `${prompt}\n\n${reactionPrompt}`,
              input: [{ role: 'user', content: letter }],
              text: { format: replyFormat },
              max_output_tokens: 2000,
              store: false,
            }),
            signal: abort.signal,
          });
          if (!upstream.ok) {
            const messages = {
              400: '当前模型没有接受回信格式，请检查模型是否支持 Structured Outputs。',
              401: 'API 密钥验证失败，请检查本地配置。',
              403: '当前 API 项目无权访问，请检查账号权限与可用地区。',
              404: '没有找到配置的模型，请检查 OPENAI_MODEL。',
              429: 'API 额度不足或请求过于频繁，请检查 API 账单和限额后重试。',
            };
            // Never forward raw provider errors: they can contain account details.
            await upstream.body?.cancel();
            return send(502, { error: messages[upstream.status] || '模型服务暂时没有完成回信，请稍后再试。' });
          }
          const data = await upstream.json();
          if (data.status !== 'completed') return send(502, { error: '这次回信没有完整生成，请稍后再试。' });
          const output = (data.output ?? [])
            .filter((item) => item.type === 'message')
            .flatMap((item) => item.content ?? [])
            .filter((item) => item.type === 'output_text' && typeof item.text === 'string')
            .map((item) => item.text).join('\n').trim();
          let result;
          try { result = JSON.parse(output); }
          catch { return send(502, { error: '这次没有收到完整回信，请稍后再试。' }); }
          if (typeof result?.reply !== 'string' || !result.reply.trim() || result.reply.length > 8000) {
            return send(502, { error: '这次没有收到完整回信，请稍后再试。' });
          }
          // Missing, unexpected, or non-playful decisions always stay quiet.
          const reaction = result.allow_playful === true && reactionNames.includes(result.reaction)
            ? result.reaction : 'quiet';
          send(200, { reply: result.reply.trim(), reaction });
        } catch (err) {
          if (err instanceof RequestError) send(err.status, { error: err.message });
          else if (abort.signal.aborted) send(504, { error: '回信等得有点久，请稍后再试。' });
          else send(502, { error: '暂时无法连接模型服务，请检查网络后重试。' });
        } finally {
          clearTimeout(timer);
          res.off('close', cancel);
          inFlight = false;
        }
        return;
      }
      if (!['GET', 'HEAD'].includes(req.method)) return send(405, { error: '不支持此请求。' });
      if (url.pathname === '/config.js') {
        // No credential, model identifier, or user content is exposed to the browser.
        const config = demo ? { mode: 'demo' } : { mode: 'live', ready };
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
        return res.end(req.method === 'HEAD' ? undefined : `window.MUMU_CONFIG = Object.freeze(${JSON.stringify(config)});`);
      }
      const asset = files.get(url.pathname);
      if (!asset) return send(404, { error: '这里没有这份文件。' });
      const content = await readFile(new URL(asset[0], publicDir));
      res.writeHead(200, { 'Content-Type': asset[1] });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch {
      send(500, { error: '木木暂时没能处理这次请求。' });
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const demo = process.argv.includes('--demo');
  const port = Number(process.env.PORT || 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT 必须是 1–65535 之间的端口号。');
  const app = createApp({ apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL, demo });
  app.requestTimeout = 15000;
  app.on('error', (err) => {
    console.error(err.code === 'EADDRINUSE' ? '端口已被占用，请修改 PORT 后重新启动。' : '本地服务启动失败。');
    process.exitCode = 1;
  });
  app.listen(port, '127.0.0.1', () => {
    console.log(`木木的树洞 · ${demo ? '公开演示' : '私人本地版'}\nhttp://127.0.0.1:${port}`);
    if (!demo && !(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL)) console.log('尚未配置 API；请按 README 编辑 .env 后重启。');
  });
}
