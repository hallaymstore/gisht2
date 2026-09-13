(()=>{
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  async function req(url,opt={}){const r=await fetch(url,{credentials:'same-origin',headers:{'content-type':'application/json'},...opt,body:opt.body&&typeof opt.body!=='string'?JSON.stringify(opt.body):opt.body});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.error||`HTTP ${r.status}`);return b;}
  function ensureUi(){
    const agent=document.querySelector('#agentDetails');
    if(agent&&!document.querySelector('#remotePaths'))agent.insertAdjacentHTML('afterend','<div id="remotePaths" class="remote-extra"></div>');
    const recent=document.querySelector('#recentCommands');
    if(recent&&!document.querySelector('#remoteNow'))recent.insertAdjacentHTML('beforebegin','<div id="remoteNow" class="remote-now"></div>');
    const jobs=document.querySelector('#jobs');
    if(jobs&&!document.querySelector('#remoteJobActions'))jobs.insertAdjacentHTML('beforebegin','<div id="remoteJobActions" class="remote-actions"></div>');
  }
  function actionButton(label,id,kind='cancel'){
    const cls=kind==='stop'?'danger':'ghost';
    return `<button class="${cls} remote-act" data-kind="${kind}" data-id="${esc(id)}">${label}</button>`;
  }
  function render(s){
    ensureUi();
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
  window.addEventListener('DOMContentLoaded',()=>{ensureUi();setTimeout(update,1200);setInterval(update,5000);});
})();
