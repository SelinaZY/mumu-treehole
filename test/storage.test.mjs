import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/storage.js';

function memory() {
  const map = new Map();
  return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) };
}
const item = (id = 'one') => ({ id, text: '今天有点累。', reply: '嗯，歇会儿。', mode: 'live', createdAt: '2026-11-09T10:00:00Z' });

test('draft and reply survive a new store instance, with demo isolated', () => {
  const disk = memory();
  const first = MumuStorage.create(disk, 'live');
  first.saveDraft('今天有点累。', true);
  const reopened = MumuStorage.create(disk, 'live');
  assert.deepEqual(reopened.read().draft, { text: '今天有点累。', wantsReply: true });
  reopened.receive(item());
  assert.deepEqual(first.read().letters, [item()]);
  assert.equal(first.read().draft.text, '');
  assert.equal(MumuStorage.create(disk, 'demo').read().letters.length, 0);
});

test('writes merge latest history, preserve a newer draft, and remove only the chosen letter', () => {
  const disk = memory();
  const a = MumuStorage.create(disk, 'live');
  const b = MumuStorage.create(disk, 'live');
  a.saveDraft('今天有点累。', true);
  b.saveDraft('另一页正在写的新草稿', false);
  a.receive(item());
  assert.equal(b.read().draft.text, '另一页正在写的新草稿');
  b.receive(item('two'));
  a.receive(item());
  assert.equal(a.read().letters.length, 2);
  a.remove('one');
  assert.deepEqual(b.read().letters.map(x => x.id), ['two']);
  a.clear();
  assert.equal(b.read().letters.length, 0);
  assert.equal(b.read().draft.text, '');
});

test('corrupt storage is not silently overwritten and explicit clearing can recover', () => {
  const disk = memory();
  const store = MumuStorage.create(disk, 'live');
  for (const value of ['{broken', JSON.stringify({ version: 2 }), JSON.stringify({ version: 1, draft: { text: '', wantsReply: false }, letters: [{ ...item(), reply: {} }] })]) {
    disk.setItem(store.key, value);
    assert.throws(() => store.read());
    assert.throws(() => store.saveDraft('new', false));
    assert.equal(disk.getItem(store.key), value);
  }
  store.clear();
  store.saveDraft('可以重新写了', false);
  assert.equal(store.read().draft.text, '可以重新写了');
});

test('quota failure leaves the previous saved draft intact', () => {
  const disk = memory();
  const store = MumuStorage.create(disk, 'live');
  store.saveDraft('尚未寄出的信', true);
  const before = disk.getItem(store.key);
  disk.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.throws(() => store.receive(item()));
  assert.equal(disk.getItem(store.key), before);
});
