/* Plays only allowlisted motions; never reads letters or calls the network. */
window.MumuReactions = {
  mount(root) {
    const world = root.querySelector('.mm-world');
    const bubble = root.querySelector('.mm-reaction-bubble');
    const status = root.querySelector('#mm-reaction-status');
    const announcement = root.querySelector('#mm-motion-announcement');
    const buttons = [...root.querySelectorAll('[data-reaction-play]')];
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const idleText = status.textContent;
    const reactions = {
      bighead: { duration: 3600, line: '啊？这也太让人头大了。', description: '木木愣了一下，脑袋胀得塞满窗户，两只小手努力扶住。' },
      sweep: { duration: 4300, line: '这破事，先扫远一点。', description: '木木拿出大扫帚，把地上的糟心黑线扫走，自己也晃了一下。' },
      steam: { duration: 4000, line: '我听着都冒烟了。', description: '木木的脸慢慢涨红，头顶冒烟，拿出小扇子给自己扇风。' },
      quiet: { duration: 0, line: '嗯，我在这儿。', description: '木木收起小道具，安静地陪小香菇坐一会儿。' },
    };
    let timer;
    let frame;
    let active = '';
    let automatic = false;

    function stop(resetStatus = true) {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      active = '';
      delete world.dataset.reaction;
      bubble.textContent = '';
      if (announcement) announcement.textContent = '';
      buttons.forEach((button) => button.setAttribute('aria-pressed', 'false'));
      if (resetStatus) status.textContent = idleText;
    }

    function play(name, options = {}) {
      const reaction = reactions[name];
      if (!reaction) return;
      stop(false);
      active = name;
      automatic = options.automatic === true;
      // Removing the previous animation for one rendered frame also allows replay.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          world.dataset.reaction = name;
          // Automatic reactions accompany the approved reply, without extra canned dialogue.
          bubble.textContent = automatic ? '' : reaction.line;
          status.textContent = `${reduced.matches ? '静态预览 · ' : ''}${reaction.description}`;
          if (announcement && automatic) announcement.textContent = reaction.description;
          buttons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.reactionPlay === name)));
          if (reaction.duration) {
            timer = setTimeout(() => {
              stop(false);
              status.textContent = '木木又回到窗边，陪你坐着。';
            }, reaction.duration);
          }
        });
      });
    }

    function motionChanged() { if (active) play(active, { automatic }); }
    reduced.addEventListener('change', motionChanged);
    // Navigating away must not leave a pending timer or resume a half-played gag.
    window.addEventListener('pagehide', () => stop());
    return { play, stop };
  },
};
