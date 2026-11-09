(() => {
  const root = document.getElementById('mumu-first-meeting');
  const $ = (selector) => root.querySelector(selector);
  const world = $('.mm-world');
  const letter = $('#mm-letter');
  const deliver = $('#mm-deliver');
  const reply = $('#mm-reply');
  const answer = $('#mm-answer');
  const visitor = $('.mm-visitor');
  const scene = $('.mm-scene');
  const error = $('#mm-error');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  // Only the local server overrides config.js. A static deployment never calls an API.
  const live = window.MUMU_CONFIG?.mode === 'live';
  const ready = live && window.MUMU_CONFIG?.ready === true;
  let current = 'home';
  let arrivalTimer, writingTimer, controller;
  let busy = false;
  let generation = 0;

  const descriptions = {
    home: '木木在窗边，一只栗棕色菌盖、奶油色身体的小香菇站在树下。这只小香菇就是你。',
    sit: '小香菇走到树旁的长椅，短短的腿垂在椅边，坐下休息。木木在窗边陪着你。',
    write: '小香菇坐在树下的地上，盘着短腿铺开信纸，微微低下圆菌盖写信。',
    received: '小香菇走到树洞门口，举起信，交给木木。',
  };

  if (live) {
    $('#mm-mode').textContent = ready ? '私人本地版 · AI 回信已配置' : '私人本地版 · 尚未配置 API';
    $('#mm-reply-label').textContent = '希望木木回一封信';
    $('#mm-privacy').textContent = '仅勾选回信并寄出时，信件才会发送给 OpenAI；本应用不保存信件';
    $('#mm-footer').textContent = '私人本地版 · AI 生成的回信可能有误';
    if (!ready) {
      reply.disabled = true;
      $('#mm-reply-label').textContent = '真实回信待开启（请先按 README 配置本地 .env 并重启）';
    }
  }

  function show(screen, animate = true) {
    const changed = screen !== current;
    current = screen;
    world.dataset.state = screen;
    root.querySelectorAll('[data-screen]').forEach((el) => { el.hidden = el.dataset.screen !== screen; });
    scene.setAttribute('aria-label', descriptions[screen]);
    clearTimeout(arrivalTimer);
    visitor.dataset.writing = 'false';
    const pose = { home: 'stand', sit: 'sit', write: 'write', received: 'give' }[screen];
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
      const heading = $(`[data-screen="${screen}"] h2`);
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
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
    deliver.textContent = value ? '木木正在读信…' : '交给木木';
    deliver.setAttribute('aria-busy', String(value));
    updateInput();
  }

  function clearLetter(screen = 'home') {
    generation += 1;
    controller?.abort();
    controller = undefined;
    letter.value = '';
    reply.checked = false;
    answer.hidden = true;
    $('#mm-answer-text').textContent = '';
    error.hidden = true;
    error.textContent = '';
    setBusy(false);
    show(screen);
  }

  root.querySelectorAll('[data-go]').forEach((button) => {
    button.addEventListener('click', () => show(button.dataset.go));
  });
  letter.addEventListener('input', () => {
    updateInput();
    error.hidden = true;
    visitor.dataset.writing = 'true';
    clearTimeout(writingTimer);
    writingTimer = setTimeout(() => { visitor.dataset.writing = 'false'; }, 800);
  });

  deliver.addEventListener('click', async () => {
    if (busy || !letter.value.trim()) return;
    error.hidden = true;
    const wantsReply = reply.checked;
    const run = ++generation;
    let replyText = '';
    if (wantsReply && live) {
      if (!ready) return;
      setBusy(true);
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 65000);
      try {
        const response = await fetch('./api/reply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Mumu-Request': '1' },
          body: JSON.stringify({ letter: letter.value.trim() }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '回信暂时没能送到，请稍后再试。');
        if (typeof data.reply !== 'string' || !data.reply.trim()) throw new Error('这次没有收到完整回信，请稍后再试。');
        replyText = data.reply;
      } catch (err) {
        if (run !== generation) return;
        error.textContent = err.name === 'AbortError'
          ? '等得有点久了，回信暂时没能送到。你的文字还在，可以稍后再试。'
          : `${err.message} 你的文字仍留在这里。`;
        error.hidden = false;
        return;
      } finally {
        clearTimeout(timeout);
        if (run === generation) {
          controller = undefined;
          setBusy(false);
        }
      }
    } else if (wantsReply) {
      replyText = '有时心里的话还是散的，写在纸上也可以是散的。\n\n木木把窗边的小灯留着。你可以在这里歇一会儿，什么也不用接着说。';
    }
    if (run !== generation) return;
    $('#mm-answer-label').textContent = live ? '木木的回信 · AI 生成' : '预先写好的示例 · 不根据你的信件生成';
    $('#mm-answer-text').textContent = replyText;
    answer.hidden = !wantsReply;
    $('#mm-received-copy').textContent = wantsReply
      ? '小香菇把信交到窗边，坐下打开一封回信。'
      : '这次只让心事在纸上停一会儿。文字没有发送到服务器。';
    show('received');
  });
  $('#mm-again').addEventListener('click', () => clearLetter('write'));
  $('#mm-clear').addEventListener('click', () => clearLetter('home'));
  // No localStorage, analytics, or letter persistence. Also clear on bfcache restoration.
  window.addEventListener('pageshow', (event) => { if (event.persisted) clearLetter(); });
  show('home', false);
  updateInput();
})();
