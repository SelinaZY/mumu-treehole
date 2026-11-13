import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const publicFile = name => readFile(new URL('../public/' + name, import.meta.url), 'utf8');
function load(source) {
  const sandbox = {window:{}, fetch:() => {throw Error('Demo must never call the network');}};
  vm.runInNewContext(source, sandbox);
  return sandbox.window.MumuDemoChat;
}
test('offline demo follows sample turns but never invents a response to arbitrary input', async () => {
  const demo = load(await publicFile('demo-chat.js'));
  const messages = [{role:'assistant', content:'开场'}];
  const first = demo.reply('先别忙了，我今天好烦', messages);
  assert.equal(first.demoKind, 'scripted');
  messages.push({role:'user',content:'先别忙了，我今天好烦'},{role:'assistant',content:first.reply});
  assert.ok(demo.suggestions(messages).includes('同事没做完，害我也得加班'));
  assert.match(demo.reply('同事没做完，害我也得加班',messages).reply, /为什么要连累你一起加班/);
  // A follow-up outside its script cannot manufacture a matching backstory.
  assert.equal(demo.reply('同事没做完，害我也得加班',[]).demoKind,'generic');
  for(const text of ['我失去了家人','完全不同的故事','<img src=x onerror=alert(1)>']) {
    const result = demo.reply(text,messages);
    assert.equal(result.demoKind,'generic');
    assert.equal(result.reaction,'quiet');
    assert.ok(!result.reply.includes(text));
  }
});
test('static Pages entry loads every shared asset from its project subdirectory', async () => {
  const html = await publicFile('index.html');
  const references = [...html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g)].map(m=>m[1]);
  assert.ok(references.includes('./chat.js'));
  assert.ok(references.includes('./demo-chat.js'));
  assert.doesNotMatch(html, /(?:src|href)="\/(?!\/)/);
  for(const ref of references) {
    assert.ok((await publicFile(ref.slice(2))).length,ref);
    assert.ok(new URL(ref,'https://selinazy.github.io/mumu-treehole/').pathname.startsWith('/mumu-treehole/'));
  }
  assert.match(html,/预写回复，不调用 AI/);
});
