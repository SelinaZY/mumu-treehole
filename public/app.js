(() => {
  const root = document.getElementById('mumu-first-meeting');
  const $ = (selector) => root.querySelector(selector);
  const world = $('.mm-world');
  const letter = $('#mm-letter');
  const deliver = $('#mm-deliver');
  const reply = $('#mm-reply');
  const answer = $('#mm-answer');
  const envelope = $('#mm-envelope');
  const visitor = $('.mm-visitor');
  const scene = $('.mm-scene');
  const error = $('#mm-error');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reactions = window.MumuReactions.mount(root);
  // Only the local server overrides config.js. A static deployment never calls an API.
  const live = window.MUMU_CONFIG?.mode === 'live';
  const ready = live && window.MUMU_CONFIG?.ready === true;
  let current = 'write';
  let arrivalTimer, writingTimer, reactionTimer, controller;
  let busy = false;
  let generation = 0;
  let selectedSample = null;
  const demoSamples = {
    bighead: { letter: '今天三件事都催着要，还一直改来改去，头都大了。', reply: '好烦，要是能一件件慢慢做就好了，怎么都挤到你这儿来了。' },
    sweep: { letter: '今天出门忘带伞，淋了雨，刚买的咖啡还洒了。好倒霉。', reply: '好烦啊，就不能让你顺顺当当过一天。剩下的时间可别再折腾你了。' },
    steam: { letter: '同事拖着没给数据，最后却要我留下加班赶报告。', reply: '好烦，一句“大家都辛苦”就要占掉你一晚上。真不想让你加这个班。' },
    quiet: { letter: '今天心情很低落，不想开玩笑，也不想听建议。想在这里待一会儿。', reply: '嗯，那就待一会儿。今天先不聊那些了。' },
  };
  world.dataset.mode = live ? 'live' : 'demo';
  const storage = window.MumuStorage.create({
    getItem: key => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
    removeItem: key => window.localStorage.removeItem(key),
  }, live ? 'live' : 'demo');
  let pendingDelete = null;
  let deleteTrigger = null;
  const historyDialog = $('#mm-letterbox');
  let historyOpener = null;
  let historyScroll = 0;

  function openHistory(opener) {
    if (historyDialog.open || busy) return;
    historyOpener = opener;
    historyScroll = window.scrollY;
    renderHistory();
    document.body.classList.add('mm-reading-history');
    historyDialog.showModal();
  }
  $('#mm-yanlai').addEventListener('click', event => openHistory(event.currentTarget));
  $('#mm-close-history').addEventListener('click', () => historyDialog.close());
  historyDialog.addEventListener('click', event => {
    const rect = historyDialog.getBoundingClientRect();
    if (event.target === historyDialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) historyDialog.close();
  });
  historyDialog.addEventListener('close', () => {
    pendingDelete = null;
    $('#mm-delete-confirm').hidden = true;
    $('#mm-history-manage').open = false;
    document.body.classList.remove('mm-reading-history');
    historyOpener?.focus({ preventScroll: true });
    window.scrollTo({ top: historyScroll, behavior: 'instant' });
  });

  function storageFailure() {
    $('#mm-storage-error').textContent = '暂时无法读写浏览器存储，可能是空间不足、存储被禁用或已有数据损坏。新内容暂未保存，请先复制留存；已有数据不会被自动覆盖。';
    $('#mm-storage-error').hidden = false;
    $('#mm-history-error').textContent = $('#mm-storage-error').textContent;
    $('#mm-history-error').hidden = false;
    $('#mm-draft-status').textContent = '草稿暂未保存，请先复制留存。';
  }
  function saveDraft() {
    try {
      storage.saveDraft(letter.value, reply.checked);
      $('#mm-storage-error').hidden = true;
      $('#mm-draft-status').textContent = letter.value ? '草稿已保存在此浏览器，下次回来可以接着写。' : '草稿自动保存在此浏览器。';
    } catch { storageFailure(); }
  }
  function askDelete(message, action, trigger) {
    pendingDelete = action;
    deleteTrigger = trigger;
    if (!historyDialog.open) openHistory(trigger);
    $('#mm-delete-message').textContent = message;
    $('#mm-delete-confirm').hidden = false;
    $('#mm-keep').focus();
  }
  function renderHistory() {
    let data;
    try { data = storage.read(); } catch { storageFailure(); return; }
    $('#mm-history-error').hidden = true;
    const list = $('#mm-history-list');
    list.replaceChildren();
    $('#mm-history-count').textContent = `${data.letters.length} 封`;
    if (!data.letters.length) {
      const empty = document.createElement('p');
      empty.className = 'mm-history-empty';
      empty.textContent = '这里还空着。以后写给木木的信，燕来会帮你收好。';
      list.append(empty);
    }
    for (const item of data.letters) {
      const entry = document.createElement('details');
      entry.className = 'mm-history-entry';
      const summary = document.createElement('summary');
      const date = document.createElement('span');
      date.className = 'mm-history-date';
      date.textContent = new Date(item.createdAt).toLocaleString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const preview = document.createElement('span');
      preview.textContent = item.text.slice(0, 42) + (item.text.length > 42 ? '…' : '');
      summary.append(date, preview);
      entry.append(summary);
      for (const [label, text] of [['你写下的话', item.text], [item.mode === 'live' ? '木木的回信 · AI 生成' : '木木的示例回信 · 预先写好', item.reply]]) {
        if (!text) continue;
        const heading = document.createElement('h3');
        heading.textContent = label;
        const body = document.createElement('p');
        body.className = 'mm-history-body';
        body.textContent = text;
        entry.append(heading, body);
      }
      if (!item.reply) {
        const note = document.createElement('p');
        note.textContent = '这封信没有请求回信。';
        entry.append(note);
      }
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'mm-text-button';
      remove.textContent = '删除这封信';
      remove.addEventListener('click', () => askDelete('删除这封信和它的回信？删除后无法恢复。', () => storage.remove(item.id), remove));
      const options = document.createElement('details');
      options.className = 'mm-letter-options';
      const optionsSummary = document.createElement('summary');
      optionsSummary.textContent = '···';
      optionsSummary.setAttribute('aria-label', '这封信的更多操作');
      options.append(optionsSummary, remove);
      entry.append(options);
      list.append(entry);
    }
  }

  const descriptions = {
    home: '木木在窗边，一只栗棕色菌盖、奶油色身体的小香菇站在树下。这只小香菇就是你。',
    sit: '小香菇走到树旁的长椅，短短的腿垂在椅边，坐下休息。木木在窗边陪着你。',
    write: '小香菇坐在树下的地上，盘着短腿铺开信纸，微微低下圆菌盖写信。',
    received: '小香菇走到树洞门口，举起信，交给木木。',
    waiting: '小香菇把信交给窗边的木木，等木木读信。',
  };

  if (live) {
    $('#mm-demo-samples').hidden = true;
    $('#mm-mode').textContent = ready ? '私人本地版 · AI 回信已配置' : '私人本地版 · 尚未配置 API';
    $('#mm-reply-label').textContent = '希望木木回一封信';
    $('#mm-privacy').textContent = '信件保存在此浏览器；仅勾选回信并寄出时，当前这封信才发送给 OpenAI';
    $('#mm-footer').textContent = '私人本地版 · AI 生成的回信可能有误';
    if (!ready) {
      reply.disabled = true;
      $('#mm-reply-label').textContent = '真实回信待开启（请先按 README 配置本地 .env 并重启）';
    }
  }

  function show(screen, animate = true) {
    reactions.stop();
    clearTimeout(reactionTimer);
    const changed = screen !== current;
    current = screen;
    world.dataset.state = screen;
    root.querySelectorAll('[data-screen]').forEach((el) => { el.hidden = el.dataset.screen !== screen; });
    const sceneActionsVisible = ['home', 'sit', 'write'].includes(screen);
    root.querySelectorAll('.mm-scene-action').forEach((button) => { button.hidden = !sceneActionsVisible; });
    $('.mm-paper-action').setAttribute('aria-expanded', String(screen === 'write'));
    $('.mm-bench-action').setAttribute('aria-pressed', String(screen === 'sit'));
    $('.mm-bench-action .mm-place-label').textContent = screen === 'sit' ? '坐在这里' : '坐一会儿';
    const hasDraft = Boolean(letter.value.trim());
    $('#mm-paper-label').textContent = screen === 'write' ? '信纸已展开' : hasDraft ? '接着写' : '写点什么';
    $('#mm-sit-note').textContent = hasDraft ? '写过的字还在，想接着写就点信纸。' : '想说话的时候，信纸就在旁边。';
    scene.setAttribute('aria-label', descriptions[screen]);
    clearTimeout(arrivalTimer);
    visitor.dataset.writing = 'false';
    const hasReply = screen === 'received' && world.dataset.hasReply === 'true';
    if (hasReply) scene.setAttribute('aria-label', '小香菇坐回长椅上，木木把回信留在窗边。');
    const pose = hasReply ? 'sit' : { home: 'stand', sit: 'sit', write: 'write', received: 'give', waiting: 'give' }[screen];
    if (animate && changed && !reducedMotion.matches) {
      visitor.dataset.pose = 'stand';
      visitor.dataset.moving = 'true';
      arrivalTimer = setTimeout(() => {
        visitor.dataset.moving = 'false';
        visitor.dataset.pose = pose;
      }, 1100);
    } else {
      visitor.dataset.moving = 'false';
      visitor.dataset.pose = pose;
    }
    if (changed) {
      const target = screen === 'sit' ? $('.mm-bench-action') : screen === 'write' ? letter : $(`[data-screen="${screen}"] h2`);
      target.tabIndex = screen === 'sit' || screen === 'write' ? 0 : -1;
      target.focus({ preventScroll: true });
    }
  }

  function updateInput() {
    $('#mm-count').textContent = `${letter.value.length} / 2000`;
    deliver.disabled = busy || !letter.value.trim();
  }

  function setBusy(value) {
    busy = value;
    letter.readOnly = value;
    reply.disabled = value || (live && !ready);
    root.querySelectorAll('[data-go]').forEach((button) => { button.disabled = value; });
    root.querySelectorAll('[data-reaction-play]').forEach((button) => { button.disabled = value; });
    root.querySelectorAll('[data-sample]').forEach((button) => { button.disabled = value; });
    $('#mm-clear-history').disabled = value;
    $('#mm-clear').disabled = value;
    $('#mm-yanlai').disabled = value;
    deliver.textContent = value ? '木木正在读信…' : '交给木木';
    deliver.setAttribute('aria-busy', String(value));
    updateInput();
  }

  function clearLetter(screen = 'write') {
    generation += 1;
    controller?.abort();
    controller = undefined;
    letter.value = '';
    reply.checked = false;
    answer.hidden = true;
    envelope.hidden = true;
    world.dataset.hasReply = 'false';
    selectedSample = null;
    $('#mm-answer-text').textContent = '';
    error.hidden = true;
    error.textContent = '';
    setBusy(false);
    saveDraft();
    show(screen);
  }

  root.querySelectorAll('[data-go]').forEach((button) => {
    button.addEventListener('click', () => {
      show(button.dataset.go);
      const target = button.dataset.go === 'write' ? letter : scene;
      target.scrollIntoView({ block: 'nearest', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
    });
  });
  root.querySelectorAll('[data-reaction-play]').forEach((button) => {
    button.addEventListener('click', () => {
      if (busy) return;
      // The visitor watches from the bench; any draft remains in the textarea.
      show('sit');
      button.focus({ preventScroll: true });
      reactions.play(button.dataset.reactionPlay);
    });
  });
  letter.addEventListener('input', () => {
    selectedSample = null;
    updateInput();
    saveDraft();
    error.hidden = true;
    visitor.dataset.writing = 'true';
    clearTimeout(writingTimer);
    writingTimer = setTimeout(() => { visitor.dataset.writing = 'false'; }, 800);
  });
  root.querySelectorAll('[data-sample]').forEach((button) => {
    button.addEventListener('click', () => {
      if (live || busy) return;
      selectedSample = button.dataset.sample;
      letter.value = demoSamples[selectedSample].letter;
      reply.checked = true;
      error.hidden = true;
      updateInput();
      saveDraft();
      letter.focus();
    });
  });
  reply.addEventListener('change', saveDraft);
  $('#mm-cancel').addEventListener('click', () => {
    generation += 1;
    controller?.abort();
    controller = undefined;
    setBusy(false);
    show('write', false);
    letter.focus();
  });
  $('#mm-open-reply').addEventListener('click', () => {
    clearTimeout(reactionTimer);
    reactions.stop();
    envelope.hidden = true;
    answer.hidden = false;
    $('#mm-answer-text').tabIndex = -1;
    $('#mm-answer-text').focus();
  });

  deliver.addEventListener('click', async () => {
    if (busy || !letter.value.trim()) return;
    error.hidden = true;
    const wantsReply = reply.checked;
    const sentText = letter.value.trim();
    const run = ++generation;
    let replyText = '';
    let reaction = 'quiet';
    if (wantsReply && live) {
      if (!ready) return;
      setBusy(true);
      show('waiting');
      scene.scrollIntoView({ block: 'start', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
      const requestController = new AbortController();
      controller = requestController;
      const timeout = setTimeout(() => requestController.abort(), 65000);
      try {
        const response = await fetch('./api/reply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Mumu-Request': '1' },
          body: JSON.stringify({ letter: sentText }),
          signal: requestController.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '回信暂时没能送到，请稍后再试。');
        if (typeof data.reply !== 'string' || !data.reply.trim()) throw new Error('这次没有收到完整回信，请稍后再试。');
        replyText = data.reply;
        reaction = ['bighead', 'sweep', 'steam'].includes(data.reaction) ? data.reaction : 'quiet';
      } catch (err) {
        if (run !== generation) return;
        error.textContent = err.name === 'AbortError'
          ? '等得有点久了，回信暂时没能送到。你的文字还在，可以稍后再试。'
          : `${err.message} 你的文字仍留在这里。`;
        error.hidden = false;
        show('write', false);
        error.scrollIntoView({ block: 'center', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
        return;
      } finally {
        clearTimeout(timeout);
        if (run === generation) {
          controller = undefined;
          setBusy(false);
        }
      }
    } else if (wantsReply) {
      const sample = demoSamples[selectedSample];
      replyText = sample?.reply || '嗯，想说的话就先放在这里。你想再待一会儿也可以。';
      reaction = sample ? selectedSample : 'quiet';
    }
    if (run !== generation) return;
    try {
      storage.receive({ id: crypto.randomUUID(), text: sentText, reply: replyText, mode: live ? 'live' : 'demo', createdAt: new Date().toISOString() });
      $('#mm-storage-error').hidden = true;
      $('#mm-saved-note').textContent = wantsReply ? '燕来把信和回信收好了，点树枝上的燕来就能回看。' : '燕来把信收好了，点树枝上的燕来就能回看。';
      letter.value = '';
      reply.checked = false;
      selectedSample = null;
      updateInput();
      $('#mm-draft-status').textContent = '草稿自动保存在此浏览器。';
      renderHistory();
    } catch {
      storageFailure();
      $('#mm-saved-note').textContent = '这封信和回信暂未保存，请先复制留存，刷新或关闭后可能丢失。';
    }
    $('#mm-answer-label').textContent = live ? '木木的回信 · AI 生成' : '预先写好的示例 · 非实时生成';
    $('#mm-answer-text').textContent = replyText;
    answer.hidden = true;
    envelope.hidden = !wantsReply;
    world.dataset.hasReply = String(wantsReply);
    $('#mm-received-copy').textContent = wantsReply
      ? '小香菇坐回长椅，木木把回信放在窗边了。'
      : '这次只让心事在纸上停一会儿。文字没有发送到服务器。';
    show('received');
    scene.scrollIntoView({ block: 'start', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
    if (wantsReply) {
      reactionTimer = setTimeout(() => {
        if (run === generation && current === 'received' && !envelope.hidden) {
          reactions.play(reaction, { automatic: true });
        }
      }, reducedMotion.matches ? 0 : 1100);
    }
  });
  $('#mm-again').addEventListener('click', () => clearLetter('write'));
  $('#mm-clear').addEventListener('click', () => {
    if (!letter.value) return;
    askDelete('清空当前草稿？信匣里已经保存的信会保留。', () => clearLetter('write'), $('#mm-clear'));
  });
  $('#mm-clear-history').addEventListener('click', () => askDelete('清空此浏览器中本版本的全部信件、回信和草稿？删除后无法恢复。', () => {
    storage.clear();
    clearLetter('write');
  }, $('#mm-clear-history')));
  $('#mm-keep').addEventListener('click', () => {
    pendingDelete = null;
    $('#mm-delete-confirm').hidden = true;
    deleteTrigger?.focus();
  });
  $('#mm-confirm-delete').addEventListener('click', () => {
    if (!pendingDelete || busy) return;
    try {
      pendingDelete();
      pendingDelete = null;
      $('#mm-delete-confirm').hidden = true;
      renderHistory();
      $('#mm-close-history').focus();
    } catch { storageFailure(); }
  });
  window.addEventListener('storage', event => {
    if (event.key === storage.key || event.key === null) renderHistory();
  });
  try {
    const saved = storage.read();
    letter.value = saved.draft.text;
    reply.checked = saved.draft.wantsReply && (!live || ready);
    if (letter.value) $('#mm-draft-status').textContent = '上次没写完的字还在，可以接着写。';
  } catch { storageFailure(); }
  renderHistory();
  show('write', false);
  updateInput();
})();
