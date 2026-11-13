// An offline script, not a model or sentiment classifier. Only exact sample
// lines receive scripted continuations; other input gets a labelled generic reply.
(() => {
  const scenes = [
    {lines:['你换个罐子不行吗','行，算我多嘴'], replies:['罐子刚买的。我再试一次，真的就一次。','也没多嘴。那个大的……你帮我递一下。'], reaction:'quiet', activity:'busy'},
    {lines:['还没塞进去吗？','掰开不就好了'], replies:['没有。它怎么比刚才还大了。','……你先别看我。我刚才怎么没想到。'], reaction:'bighead'},
    {lines:['先别忙了，我今天好烦','同事没做完，害我也得加班','我只想早点回家'], replies:['来了。饼干先不管了。','好烦，要是不工作就好了。为什么要连累你一起加班。','我也是。都已经在心里下班了，还得坐回去。'], reaction:'steam'},
    {lines:['事情一件接一件，我的脑袋快打结了','今天真的不想动了'], replies:['啊，还来。脑袋都装不下了，先别往里塞了。','不动。谁来喊都先当没听见。'], reaction:'bighead'},
    {lines:['今天有点难过，想安静待一会儿','那你坐过来一点'], replies:['嗯，给你腾个位置。','好，挨着你。饼干也放这儿。'], reaction:'quiet'},
    {lines:['我剪的视频终于做完了','先让我自己看两遍'], replies:['终于！快让我看看，你忙了好几天呢。','行。我不催，第三遍带上我。'], reaction:'quiet'},
    {lines:['刚收拾好的桌子又被碰洒了奶茶','白收拾了，气死我了'], replies:['啊——刚收拾好啊。纸巾呢，我帮你拿。','烦死了。先把这一摊弄走，看着更气。'], reaction:'sweep'},
  ];
  const starters = ['先别忙了，我今天好烦','我剪的视频终于做完了','今天有点难过，想安静待一会儿'];
  function locate(text, messages) {
    const last = messages.at(-1)?.content;
    for (const scene of scenes) {
      const i = scene.lines.indexOf(text);
      if (i === 0 || (i > 0 && last === scene.replies[i - 1])) return {scene, i};
    }
    return null;
  }
  function reply(text, messages = []) {
    const match = locate(text, messages);
    if (!match) return {reply:'给你留了半块饼干。先在这儿待会儿吧。', reaction:'quiet', activity:'listening', demoKind:'generic'};
    const {scene, i} = match;
    return {reply:scene.replies[i], reaction:i === 0 && scene.lines[0] === starters[0] ? 'quiet' : scene.reaction, activity:scene.activity || 'listening', demoKind:'scripted'};
  }
  function suggestions(messages) {
    if (messages.length === 1) return ['你换个罐子不行吗', ...starters];
    const last = messages.at(-1)?.content;
    for (const scene of scenes) {
      const i = scene.replies.indexOf(last);
      if (i >= 0 && i + 1 < scene.lines.length) return [scene.lines[i + 1], '事情一件接一件，我的脑袋快打结了', '刚收拾好的桌子又被碰洒了奶茶'];
    }
    return starters;
  }
  window.MumuDemoChat = Object.freeze({reply, suggestions});
})();
