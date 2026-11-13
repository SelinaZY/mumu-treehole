const $ = s => document.querySelector(s);
const opening = '先别笑。就差一点点，它就能进去了。';
const demo=window.MUMU_CONFIG?.mode!=='live';
const key = demo?'mumu-demo-chat-session-v1':'mumu-visit-session-v1';
let messages = [{role:'assistant',content:opening}], draft='', activity='busy';
let company='apart', gestureNote='', gestureTimer, approachTimer;
let approaching=false, returning=false;
function finishApproach(){clearTimeout(approachTimer);approaching=false;returning=false;$('.mm-world').classList.remove('approaching','returning');}

let controller, requestId=0, pending='', busy=false, storageFailed=false;
let speakingTimer;
const ready=demo||window.MUMU_CONFIG?.ready===true;
$('#mode-label').textContent=demo?'公开演示 · 预写回复，不调用 AI':'私人版 · AI 回应';
$('#setup-note').hidden=!demo;
function demoLabel(kind){return kind==='generic'?'通用示例 · 未分析你的输入':'预写示例 · 非 AI 生成';}
const reactions=window.MumuReactions.mount($('#mumu-first-meeting'));
function stopSpeaking(){clearTimeout(speakingTimer);$('.mm-world').classList.remove('speaking');}
function speak(){stopSpeaking();$('.mm-world').classList.add('speaking');speakingTimer=setTimeout(stopSpeaking,4000);}

try {
  const saved=JSON.parse(sessionStorage.getItem(key)||'null');
  if(saved && Array.isArray(saved.messages) && saved.messages.length<=201 && saved.messages.every((m,i)=>['user','assistant'].includes(m.role)&&typeof m.content==='string'&&m.content.length<=8000&&m.content.trim()&&(!i||m.role!==saved.messages[i-1].role)) && saved.messages.at(-1)?.role==='assistant') {
    messages=saved.messages;draft=typeof saved.draft==='string'?saved.draft.slice(0,2000):'';activity=saved.activity==='listening'?'listening':'busy';company=['apart','near','sharing','rest'].includes(saved.company)?saved.company:'apart';pending=typeof saved.pending==='string'?saved.pending.slice(0,2000):'';
  }
} catch {storageFailed=true;}
function save(){try{sessionStorage.setItem(key,JSON.stringify({messages:messages.slice(-201),draft,activity,company,pending}));storageFailed=false;}catch{storageFailed=true;}$('#aside').textContent=storageFailed?'此浏览器暂时无法保存，离开前请复制需要留下的话。':'';}
function error(text=''){$('#error').textContent=text;$('#error').hidden=!text;}
function context(text){let recent=messages.slice(-20);while(recent.length && recent.reduce((n,m)=>n+m.content.length,0)+text.length>18000)recent.shift();return [...recent,{role:'user',content:text}];}
function resizeComposer(){const input=$('#words');input.style.height='auto';input.style.height=Math.min(input.scrollHeight,112)+'px';}
// Fixed artwork only: message content is always assigned with textContent.
function characterAvatar(role){
  const shape=role==='user'
    ? '<path d="M15 27q-2 9 2 11h14q4-2 1-11" fill="#f1e2c3"/><path d="M4 24Q6 4 24 5q18 1 20 19-16 8-40 0" fill="#986746"/><path d="M4 24q20 8 40 0" fill="none" stroke="#d9b98c" stroke-width="4"/><path d="m24 9 2 5 5 1-5 2-2 5-2-5-5-2 5-1Z" fill="#e7c998"/><circle cx="19" cy="30" r="1.2"/><circle cx="29" cy="30" r="1.2"/><path d="M22 34q2 2 4 0" fill="none" stroke="#796448"/>'
    : '<path d="M24 13V7" stroke="#829b62" stroke-width="2"/><path d="M24 8q-1-8 10-6 0 8-10 6" fill="#8ca66f"/><path d="M8 31Q5 13 24 12q19 1 16 19l-1 7H9Z" fill="#ecddb6"/><ellipse cx="11" cy="36" rx="6" ry="4" fill="#e7d8b6"/><ellipse cx="37" cy="36" rx="6" ry="4" fill="#e7d8b6"/><circle cx="18" cy="25" r="1.3"/><circle cx="30" cy="25" r="1.3"/><ellipse cx="12" cy="29" rx="3" ry="1.8" fill="#dfbd9e"/><ellipse cx="36" cy="29" rx="3" ry="1.8" fill="#dfbd9e"/><path d="M22 29h4" stroke="#796448"/>';
  return '<svg viewBox="0 0 48 44" fill="#796448" aria-hidden="true" focusable="false">'+shape+'</svg>';
}
function syncThread(){
  const talk=$('#talk'), items=pending?[...messages,{role:'user',content:pending}]:messages;
  // Keep existing message nodes in place: scene changes must not replay or reread old messages.
  items.forEach((m,i)=>{
    let row=talk.children[i];
    if(!row){row=document.createElement('div');row.className='message';const name=document.createElement('span');name.className='speaker sr';const p=document.createElement('p');const avatar=document.createElement('span');avatar.className='chat-avatar';avatar.setAttribute('aria-hidden','true');avatar.innerHTML=characterAvatar(m.role);row.append(name,avatar,p);talk.append(row);}
    row.className='message '+(m.role==='user'?'you':'mumu');
    const label=m.role==='user'?'你：':'木木：';if(row.querySelector('.speaker').textContent!==label)row.querySelector('.speaker').textContent=label;
    const p=row.querySelector('p');if(p.firstChild?.textContent!==m.content){p.replaceChildren(document.createTextNode(m.content));if(demo&&m.role==='assistant'&&i>0){const tag=document.createElement('small');tag.className='demo-tag';tag.textContent=demoLabel(m.demoKind);p.append(tag);}}
    row.classList.toggle('pending',!!pending&&i===messages.length);
  });
  while(talk.children.length>items.length)talk.lastElementChild.remove();
  syncCurrent();
  $('#reply-status').hidden=!busy||company==='rest';
  $('#outbox').hidden=!pending||busy||company==='rest';
}
function syncCurrent(){
  const current=pending?{role:'user',content:pending}:messages.at(-1);
  const name=current.role==='user'?'你 · 小香菇':'木木';
  $('#demo-reply-kind').hidden=!demo||company==='rest'||current.role!=='assistant'||messages.length===1;
  $('#demo-reply-kind').textContent=demoLabel(current.demoKind);
  const line=$('#current-line'), changed=line.textContent!==current.content||$('#current-name').textContent!==name;
  $('.mm-world').dataset.speaker=company==='rest'?'quiet':current.role;
  $('#current-name').textContent=company==='rest'?'一起待会儿':name;
  $('#current-avatar').innerHTML=characterAvatar(current.role);
  $('#current-turn').hidden=company==='rest';
  if(line.textContent!==current.content){line.textContent=current.content;line.scrollTop=0;}
  if($('#current-announcer').textContent!==name+'：')$('#current-announcer').textContent=name+'：';
  const previous= !pending&&messages.length>1 ? messages.at(-2) : null;
  $('#previous-line').hidden=!previous||company==='rest';
  if(previous)$('#previous-line').textContent='你刚才说：'+previous.content.slice(0,90)+(previous.content.length>90?'…':'');
  const count=messages.length+(pending?1:0);
  $('#history-count').textContent=count>1?String(count):'';
  $('#history-open').setAttribute('aria-label','回看聊天，共 '+(messages.length+(pending?1:0))+' 条');
  if(changed&&$('#history').open)$('#history-update').textContent=busy?'木木正在回复，关上回看就能看到。':'有新的对话，关上回看就能看到。';
}
function openHistory(){
  syncThread();$('#history-update').textContent='';$('#history').showModal();
  requestAnimationFrame(()=>{$('#talk').scrollTop=$('#talk').scrollHeight;});
}
$('#history-open').onclick=openHistory;
$('#previous-line').onclick=openHistory;
$('#history-close').onclick=()=>$('#history').close();
$('#history').addEventListener('click',e=>{if(e.target===$('#history')){const r=$('#history').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('#history').close();}});
window.addEventListener('resize',resizeComposer);
new ResizeObserver(()=>document.documentElement.style.setProperty('--dialogue-height',$('.conversation').offsetHeight+'px')).observe($('.conversation'));
function render(){
  $('.mm-world').classList.toggle('interrupted',busy||activity==='listening'||company!=='apart');
  $('.mm-scene').setAttribute('aria-label',activity==='busy'&&!busy?'木木在窗边摆弄饼干罐，小香菇坐在长椅上。':'木木放下饼干，小香菇坐在旁边聊天。');
  $('.mm-world').dataset.company=company;
  $('#chat-dock').hidden=company==='rest';document.body.classList.toggle('resting',company==='rest');
  if(company!=='apart')$('.mm-scene').setAttribute('aria-label',company==='rest'?'木木坐到树下，小香菇轻轻靠在旁边，两个人安静待着。':'木木从窗边下来，和小香菇并排坐在树下。');
  const moving=approaching||returning;
  $('#closer').hidden=company!=='apart'||returning;
  $('#go-home').hidden=company==='apart'&&!returning;
  $('#rest').hidden=company==='apart';
  $('#rest').setAttribute('aria-pressed',String(company==='rest'));
  const restLabel=company==='rest'?'碰一碰小香菇，重新坐好':'碰一碰小香菇，靠着木木歇会儿';
  $('#rest').setAttribute('aria-label',restLabel);$('#rest').title=company==='rest'?'重新坐好':'靠着木木歇会儿';
  for(const id of ['closer','share','rest','go-home','resume'])$('#'+id).disabled=busy||moving;
  $('#input-hint').hidden=company==='rest';$('#suggestions').hidden=company==='rest';$('#chat').hidden=company==='rest';$('#resume').hidden=company!=='rest';
  $('#gesture-note').textContent=gestureNote;$('#gesture-note').hidden=!gestureNote;
  $('#weather').textContent=activity==='busy'&&!busy?'树荫下，饼干碎掉了一地':'窗边的小灯亮着';
  $('#stage').textContent=busy?'木木正在听。':activity==='busy'?'木木正在和饼干罐较劲。':'木木在窗边。想叫它下来，就拍拍空位。';
  if(company==='rest'){$('#stage').textContent='树叶轻轻晃着。不说话也可以。';$('#weather').textContent='没有什么要赶着做的';}
  else if(company!=='apart'&&!busy)$('#stage').textContent=company==='sharing'?'一人一半，碎屑留给燕来。':'木木在你旁边坐下了。';
  if(returning){$('#stage').textContent='木木拍拍裤子，慢悠悠地走回树屋。';$('.mm-scene').setAttribute('aria-label','木木从长椅起身，走回树屋。');}
  else if(approaching)$('#stage').textContent='木木抬起头，把饼干放下了。';
  syncThread();
  $('#suggestions').replaceChildren();const choices=demo?window.MumuDemoChat.suggestions(messages):messages.length===1?['你换个罐子不行吗','先别忙了，我今天好烦']:[];if(!busy&&!pending&&company!=='rest'&&!returning)for(const text of choices){const b=document.createElement('button');b.type='button';b.textContent=text;b.disabled=!ready;b.onclick=()=>send(text);$('#suggestions').append(b);}
  if($('#words').value!==draft)$('#words').value=draft;resizeComposer();$('#send').disabled=busy||!!pending||!ready||!draft.trim();$('#withdraw').disabled=!!draft;$('#cancel').hidden=!busy;$('#reset').disabled=busy;$('#prop').disabled=busy||!ready||company!=='apart'||returning;
}
async function send(text,retry=false){
  if(busy||!ready||!text.trim()||(pending&&!retry))return;
  finishApproach();if(company==='rest')company='near';clearTimeout(gestureTimer);gestureNote='';
  text=text.trim();const run=++requestId;pending=text;if(!retry&&draft.trim()===text)draft='';busy=true;error();stopSpeaking();reactions.stop();save();render();
  controller=new AbortController();const current=controller;const timeout=setTimeout(()=>current.abort('timeout'),65000);
  try{
    let data;
    if(demo){
      await new Promise((resolve,reject)=>{const done=()=>{current.signal.removeEventListener('abort',cancel);resolve();};const timer=setTimeout(done,650);const cancel=()=>{clearTimeout(timer);reject(new Error('已停止演示。'));};current.signal.addEventListener('abort',cancel,{once:true});});
      data=window.MumuDemoChat.reply(text,messages);
    }else{
      const response=await fetch('./api/chat',{method:'POST',headers:{'Content-Type':'application/json','X-Mumu-Request':'1'},body:JSON.stringify({messages:context(text),activity,company}),signal:current.signal});
      data=await response.json();
      if(!response.ok)throw new Error(data.error||'这句还没接上，请再试一次。');
    }
    if(run!==requestId)return;
    if(typeof data.reply!=='string'||!data.reply.trim())throw new Error('没有收到完整回应，话还替你留着。');
    messages.push({role:'user',content:text},{role:'assistant',content:data.reply,...(demo?{demoKind:data.demoKind}:{})});activity=data.activity==='busy'?'busy':'listening';pending='';busy=false;save();render();reactions.play(data.reaction,{automatic:true});speak();
  }catch(e){if(run===requestId){error(current.signal.aborted?'等得有点久，想说的话还在。可以手动再试一次。':e.message);}}
  finally{clearTimeout(timeout);if(run===requestId){busy=false;controller=null;render();save();}}
}
$('#words').oninput=()=>{draft=$('#words').value;resizeComposer();$('#send').disabled=busy||!!pending||!ready||!draft.trim();$('#withdraw').disabled=!!draft;save();};
$('#words').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.keyCode!==229){e.preventDefault();send($('#words').value);}};
$('#chat').onsubmit=e=>{e.preventDefault();send($('#words').value);};
$('#cancel').onclick=()=>{requestId++;controller?.abort();controller=null;busy=false;error(demo?'已停止演示。这句话还留着，可以重试。':'已停止等待。这条消息还留着，可以重试；请求仍可能产生用量。');save();render();$('#words').focus({preventScroll:true});};
$('#retry').onclick=()=>send(pending,true);
$('#withdraw').onclick=()=>{if(draft)return;draft=pending;pending='';error();save();render();$('#words').focus({preventScroll:true});};
function gesture(next){
  if(busy||approaching||returning)return;
  const arriving=company==='apart'&&next!=='apart';
  clearTimeout(gestureTimer);stopSpeaking();reactions.stop();company=next;activity='listening';
  gestureNote=next==='sharing'?'木木掰开饼干，把大的一半递给你。':next==='rest'?'小香菇挪近一点，靠住了木木。':'';
  approaching=arriving&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  $('.mm-world').classList.toggle('approaching',approaching);
  save();render();
  if(approaching){
    $('#stage').textContent='木木抬起头，把饼干放下了。';
    approachTimer=setTimeout(()=>{finishApproach();render();},2400);
  }
  gestureTimer=setTimeout(()=>{gestureNote='';$('#gesture-note').hidden=true;},6500);
}
$('#closer').onclick=()=>gesture('near');
function touchSprout(){
  if(busy||approaching||returning)return;
  const world=$('.mm-world');
  world.classList.remove('sprout-tapped');
  // Restart the small touch response, including when already sharing a cookie.
  void world.offsetWidth;
  world.classList.add('sprout-tapped');
  gesture('sharing');
}
$('#share').onclick=touchSprout;
function toggleRest(){gesture(company==='rest'?'near':'rest');}
$('#rest').onclick=toggleRest;
$('#go-home').onclick=()=>{
  if(busy||approaching||returning||company==='apart')return;
  clearTimeout(gestureTimer);stopSpeaking();reactions.stop();gestureNote='';
  company='apart';activity='listening';
  returning=!window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  $('.mm-world').classList.remove('sprout-tapped');
  $('.mm-world').classList.toggle('returning',returning);
  save();render();
  if(returning)approachTimer=setTimeout(()=>{finishApproach();render();},2400);
};
$('#resume').onclick=()=>{gesture('near');render();$('#words').focus({preventScroll:true});};
$('#prop').onclick=()=>send('还没塞进去吗？');
$('#reset').onclick=()=>{if(!confirm('开始新聊天会清除当前对话和未发送的草稿，无法恢复。确定开始吗？'))return;requestId++;finishApproach();stopSpeaking();reactions.stop();messages=[{role:'assistant',content:opening}];draft='';pending='';activity='busy';company='apart';gestureNote='';clearTimeout(gestureTimer);error();save();render();$('#words').focus({preventScroll:true});};
function showNote(){$('#note-text').textContent=demo?'你和木木住在同一个小场景里。拍拍空位、碰碰树苗，都可以打个招呼。这里的回话是预写示例：点击示例句可接着聊，自由输入只会收到通用示例，不会上传或分析你的话。本次演示和草稿只留在这个标签页。':'木木的回应由 AI 生成。本次聊天与草稿保留在这个标签页，刷新可恢复；发送时只带上近期对话，不读取旧信，也没有跨次聊天的长期记忆。';$('#note').showModal();}
$('#mm-yanlai').onclick=showNote;$('#mode-about').onclick=showNote;$('#close-note').onclick=()=>$('#note').close();
window.addEventListener('pagehide',()=>{requestId++;controller?.abort();finishApproach();stopSpeaking();clearTimeout(gestureTimer);save();});
window.addEventListener('pageshow',e=>{if(e.persisted){busy=false;controller=null;render();}});
if(pending)error('上次这条消息还没收到回复。可以重试，或放回输入框。');
if(!ready)error('请在项目的 .env 配置 API Key 和模型，重启本地服务后再来。');render();if(storageFailed)$('#aside').textContent='此浏览器暂时无法恢复聊天，离开前请复制需要留下的话。';
