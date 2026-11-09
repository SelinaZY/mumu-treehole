/* Versioned browser-only storage. No network access or provider history. */
(function (root) {
  function create(storage, mode) {
    const key = `mumu-letterbox-v1-${mode === 'live' ? 'live' : 'demo'}`;
    const empty = () => ({ version: 1, draft: { text: '', wantsReply: false }, letters: [] });
    function read() {
      const raw = storage.getItem(key);
      if (raw === null) return empty();
      const data = JSON.parse(raw);
      if (data?.version !== 1 || typeof data.draft?.text !== 'string' || data.draft.text.length > 2000 || typeof data.draft.wantsReply !== 'boolean' || !Array.isArray(data.letters) || !data.letters.every(item =>
        typeof item.id === 'string' && typeof item.text === 'string' && item.text.length <= 2000 &&
        typeof item.reply === 'string' && item.reply.length <= 8000 && ['live', 'demo'].includes(item.mode) &&
        typeof item.createdAt === 'string' && Number.isFinite(Date.parse(item.createdAt)))) {
        throw new Error('Invalid letterbox data');
      }
      return data;
    }
    function update(change) {
      const data = read(); // Merge against the latest state, including other tabs' changes.
      change(data);
      storage.setItem(key, JSON.stringify(data));
      return data;
    }
    return {
      key, read,
      saveDraft: (text, wantsReply) => update(data => { data.draft = { text, wantsReply }; }),
      receive: item => update(data => {
        if (!data.letters.some(saved => saved.id === item.id)) data.letters.unshift(item);
        // Don't clear a newer draft entered in another tab while a reply was pending.
        if (data.draft.text.trim() === item.text) data.draft = empty().draft;
      }),
      remove: id => update(data => { data.letters = data.letters.filter(item => item.id !== id); }),
      clear: () => { storage.removeItem(key); return empty(); },
    };
  }
  root.MumuStorage = { create };
})(globalThis);
