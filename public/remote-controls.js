(()=>{
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  async function req(url,opt={}){const r=await fetch(url,{credentials:'same-origin',headers:{'content-type':'application/json'},...opt,body:opt.body&&typeof opt.body!=='string'?JSON.stringify(opt.body):opt.body});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.error||`HTTP ${r.status}`);return b;}
  function isOnline(a){return a&&Date.now()-Date.parse(a.lastSeenAt||0)<120000}
  function ensureUi(){
    const stats=document.querySelector('#stats');
    if(stats&&!document.querySelector('#remoteQuickAction'))stats.insertAdjacentHTML('afterend','<div id="remoteQuickAction"></div>');
    const agent=document.querySelector('#agentDetails');
    if(agent&&!document.querySelector('#remotePaths'))agent.insertAdjacentHTML('afterend','<div id="remotePaths" class="remote-extra"></div>');
    const recent=document.querySelector('#recentCommands');
    if(recent&&!document.querySelector('#remoteNow'))recent.insertAdjacentHTML('beforebegin','<div id="remoteNow" class="remote-now"></div>');
    const jobs=document.querySelector('#jobs');
    if(jobs&&!document.querySelector('#remoteJobActions'))jobs.insertAdjacentHTML('beforebegin','<div id="remoteJobActions" class="remote-actions"></div>');
    const channelCard=document.querySelector('#page-channels .card');
    if(channelCard&&!document.querySelector('#oauthFeedback')){
      const head=channelCard.querySelector('.head');
      const box=document.createElement('div'); box.id='oauthFeedback'; box.style.display='none'; box.style.margin='14px 0'; box.style.padding='14px 16px'; box.style.borderRadius='14px'; box.style.lineHeight='1.45';
      head?.insertAdjacentElement('afterend',box);
    }
  }
  function actionButton(label,id,kind='cancel'){
    const cls=kind==='stop'?'danger':'ghost';
    return `<button class="${cls} remote-act" data-kind="${kind}" data-id="${esc(id)}">${label}</button>`;
  }
  function renderQuick(s){
    const box=document.querySelector('#remoteQuickAction');if(!box)return;
    const a=s.agents?.[0],online=isOnline(a),channels=(s.channels||[]).filter(c=>c.enabled!==false);
    const old=document.querySelector('#remoteLaunchChannel')?.value||'';
    const opts=channels.map(c=>`<option value="${esc(c.channelId)}"${c.channelId===old?' selected':''}>${esc(c.title)}</option>`).join('');
    box.innerHTML=`<article class="card remote-launch"><div class="head"><div><h2>▶ Video tayyorlash</h2><p>Telefondan buyruq bering. Video PC’dagi papkalardan tayyorlanadi.</p></div><span class="badge ${online?'on':''}">${online?'PC ONLINE':'PC OFFLINE'}</span></div><div class="form-grid"><label>Kanal<select id="remoteLaunchChannel" ${channels.length?'':'disabled'}>${opts||'<option>Kanal ulanmagan</option>'}</select></label><div style="align-self:end"><button id="remoteLaunchBtn" class="full" ${channels.length?'':'disabled'}>▶ Video tayyorla va YouTube’ga joyla</button></div></div><div class="${online?'good':'recommend info'}">${online?'Buyruq darhol Local Agent’ga boradi.':'PC hozir o‘chiq/offline. Buyruq cloud navbatida saqlanadi va Local Agent qayta ishga tushganda avtomatik boshlanadi.'}</div></article>`;
    const btn=document.querySelector('#remoteLaunchBtn');if(btn)btn.onclick=async()=>{btn.disabled=true;const channelId=document.querySelector('#remoteLaunchChannel')?.value;try{await req('/api/jobs/enqueue',{method:'POST',body:{channelId}});alert(online?'Buyruq PC’ga yuborildi ✅':'Buyruq navbatga saqlandi ✅ PC yoqilganda avtomatik boshlanadi.');await update();}catch(e){alert(e.message)}finally{btn.disabled=false}};
  }
  function render(s){
    ensureUi();renderQuick(s);
    const a=s.agents?.[0];
    const p=document.querySelector('#remotePaths');
    if(p)p.innerHTML=a?`<div class="info-row"><span>Video bo‘laklar</span><b>${esc(a.clipDir||'Tanlanmagan')}</b></div><div class="info-row"><span>Musiqalar</span><b>${esc(a.musicDir||'Tanlanmagan')}</b></div><div class="info-row"><span>Tayyor video</span><b>${esc(a.outputDir||'Tanlanmagan')}</b></div><div class="info-row"><span>Thumbnail</span><b>${esc(a.thumbnailDir||'Ixtiyoriy')}</b></div>`:'<p class="hint">PC Agent hali ulanmagan.</p>';
    const rows=s.agentCommands||[];
    const active=rows.find(x=>['claimed','rendering','metadata','uploading','cancel_requested'].includes(x.status));
    const now=document.querySelector('#remoteNow');
    if(now)now.innerHTML=active?`<article class="card"><div class="head"><div><h2>Hozirgi ish</h2><p>${esc(active.channelTitle)} • ${esc(active.stage||active.status)}</p></div><b>${Number(active.progress||0)}%</b></div><div class="progress"><i style="width:${Math.min(100,Number(active.progress||0))}%"></i></div><div class="row">${active.status==='cancel_requested'?'<button disabled>To‘xtatilmoqda…</button>':actionButton('⏹ STOP',active.id,'stop')}</div></article>`:'';
    const box=document.querySelector('#remoteJobActions');
    if(box){const actionable=rows.filter(x=>['queued','scheduled','failed','cancelled'].includes(x.status)).slice(0,10);box.innerHTML=actionable.map(x=>`<div class="info-row"><span>${esc(x.channelTitle)} • ${esc(x.status)}${x.scheduledLocal?` • ${esc(x.scheduledLocal)}`:''}</span><b>${['failed','cancelled'].includes(x.status)?actionButton('Retry',x.id,'retry'):actionButton('Bekor',x.id,'cancel')}</b></div>`).join('');}
    document.querySelectorAll('.remote-act').forEach(btn=>btn.onclick=async()=>{btn.disabled=true;try{if(btn.dataset.kind==='retry')await req(`/api/jobs/${encodeURIComponent(btn.dataset.id)}/retry`,{method:'POST'});else await req(`/api/jobs/${encodeURIComponent(btn.dataset.id)}/cancel`,{method:'POST'});await update();}catch(e){alert(e.message)}finally{btn.disabled=false;}});
  }
  async function update(){try{const s=await req('/api/status');render(s);}catch(e){/* panel login/offline: main UI handles it */}}

  function oauthFriendly(raw){
    const m=String(raw||'');
    if(/suspended/i.test(m))return {title:'Kanal ulanmagan',text:'Tanlangan YouTube kanal suspended/bloklangan. Bu kanalni API orqali ulab bo‘lmaydi. “+ Kanal ulash”ni qayta bosing va faol (bloklanmagan) YouTube kanal joylashgan Google/Brand Accountni tanlang.'};
    if(/invalid_grant|token has been expired|revoked/i.test(m))return {title:'Google ruxsati eskirgan',text:'Google ruxsati bekor qilingan yoki muddati tugagan. Kanalni qayta ulang.'};
    if(/access_denied/i.test(m))return {title:'Ruxsat berilmadi',text:'Google ruxsati yakunlanmagan. Test user/Google Auth Platform sozlamalarini tekshiring va qayta urinib ko‘ring.'};
    if(/redirect_uri_mismatch/i.test(m))return {title:'OAuth callback noto‘g‘ri',text:'Google Cloud OAuth redirect URI Render callback bilan mos emas.'};
    if(/quota|rate.?limit/i.test(m))return {title:'YouTube API limiti',text:'YouTube API quota/limitga urildi. Keyinroq qayta urinib ko‘ring.'};
    if(/YouTube kanal topilmadi|youtubeSignupRequired/i.test(m))return {title:'YouTube kanal topilmadi',text:'Tanlangan Google hisobida faol YouTube kanal yo‘q. Avval YouTube kanal yarating yoki boshqa hisobni tanlang.'};
    return {title:'Kanal ulashda xato',text:m||'Noma’lum OAuth xatosi.'};
  }
  function showOauthBox(ok,title,text){
    ensureUi(); const box=document.querySelector('#oauthFeedback'); if(!box)return;
    box.style.display='block'; box.style.border=`1px solid ${ok?'#1f9d75':'#c74762'}`; box.style.background=ok?'rgba(31,157,117,.12)':'rgba(199,71,98,.12)'; box.style.color=ok?'#bff5df':'#ffd0da';
    box.innerHTML=`<b style="display:block;margin-bottom:5px">${esc(title)}</b><span>${esc(text)}</span>`;
  }
  async function handleOauthReturn(){
    ensureUi();
    const q=new URLSearchParams(location.search),oauth=q.get('oauth'),message=q.get('message');
    const pending=Number(localStorage.getItem('automix_oauth_pending')||0);
    const recent=pending&&Date.now()-pending<20*60*1000;
    if(oauth==='error'){
      try{if(typeof nav==='function')nav('channels')}catch{}
      const f=oauthFriendly(message);showOauthBox(false,f.title,f.text);localStorage.removeItem('automix_oauth_pending');
      history.replaceState({},'',location.pathname+'#channels');return;
    }
    if(recent&&location.hash.includes('channels')){
      try{
        const s=await req('/api/status');
        if(s.channels?.length){const last=[...s.channels].sort((a,b)=>Date.parse(b.oauthConnectedAt||b.updatedAt||0)-Date.parse(a.oauthConnectedAt||a.updatedAt||0))[0];showOauthBox(true,'Kanal ulandi ✅',last?.title?`${last.title} saqlandi. Kanal ro‘yxati va Analytics endi shu OAuth token bilan ishlaydi.`:'Google OAuth muvaffaqiyatli yakunlandi.');}
        else showOauthBox(false,'Kanal saqlanmadi','Google oynasidan qaytildi, lekin serverda kanal paydo bo‘lmadi. “+ Kanal ulash”ni qayta bosing va boshqa faol YouTube kanalni tanlang.');
        try{if(typeof refresh==='function')await refresh()}catch{}
      }catch(e){showOauthBox(false,'Kanal holatini tekshirib bo‘lmadi',e.message)}
      localStorage.removeItem('automix_oauth_pending');
    }
  }
  document.addEventListener('click',e=>{const a=e.target.closest?.('a[href="/auth/google"]');if(a)localStorage.setItem('automix_oauth_pending',String(Date.now()));});
  window.addEventListener('DOMContentLoaded',()=>{ensureUi();setTimeout(update,1200);setInterval(update,5000);setTimeout(handleOauthReturn,300);});
})();
