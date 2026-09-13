const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
let snapshot = null;
let deferredInstall = null;
let serverBaseMs = 0;
let serverFetchedAt = 0;

async function rawJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    credentials: 'same-origin',
    ...options,
    body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function api(url, options = {}) {
  const { response, body } = await rawJson(url, options);
  if (response.status === 401 && (body.authRequired || body.error === 'AUTH_REQUIRED')) {
    showLogin();
    throw new Error('Panelga qayta kirish kerak');
  }
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

function showLogin() {
  $('#loginScreen').classList.remove('hidden');
  $('#appMain').classList.add('hidden');
  $('#logoutBtn').classList.add('hidden');
  setTimeout(() => $('#loginPassword')?.focus(), 50);
}
function showApp(authRequired = false) {
  $('#loginScreen').classList.add('hidden');
  $('#appMain').classList.remove('hidden');
  $('#logoutBtn').classList.toggle('hidden', !authRequired);
}

async function login() {
  $('#loginError').textContent = '';
  const { response, body } = await rawJson('/api/login', { method: 'POST', body: { password: $('#loginPassword').value } });
  if (!response.ok) { $('#loginError').textContent = body.error || 'Kirish xatosi'; return; }
  $('#loginPassword').value = '';
  showApp(Boolean(body.authRequired));
  await refresh();
}

function notify(text, error = false) {
  const box = $('#notice'); box.textContent = text; box.classList.remove('hidden','error');
  if (error) box.classList.add('error');
  clearTimeout(notify.t); notify.t = setTimeout(() => box.classList.add('hidden'), 6000);
}

function num(n) { return new Intl.NumberFormat().format(Number(n || 0)); }
function shortTime(v) {
  if (!v) return '—';
  try { return new Date(v).toLocaleString('uz-UZ', snapshot?.settings?.timezone ? { timeZone: snapshot.settings.timezone } : undefined); }
  catch { return new Date(v).toLocaleString(); }
}

function serverNow() {
  if (!serverBaseMs) return new Date();
  return new Date(serverBaseMs + (Date.now() - serverFetchedAt));
}
function serverLocalKey(offsetMinutes = 0) {
  const date = new Date(serverNow().getTime() + offsetMinutes * 60000);
  const tz = snapshot?.settings?.timezone || 'Asia/Samarkand';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).formatToParts(date);
  const get = t => parts.find(p => p.type === t)?.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
function updateClock() {
  if (!snapshot?.time) return;
  const tz = snapshot.time.timezone;
  try {
    $('#serverClock').textContent = new Intl.DateTimeFormat('uz-UZ', { timeZone: tz, hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23' }).format(serverNow());
  } catch { $('#serverClock').textContent = snapshot.time.localDisplay || '--:--:--'; }
}

async function refresh() {
  try {
    snapshot = await api('/api/status');
    serverBaseMs = Date.parse(snapshot.time?.serverUtc || Date.now());
    serverFetchedAt = Date.now();
    $('#serverDot').classList.add('ok'); $('#serverText').textContent = 'Server online';
    showApp(Boolean(snapshot.remote?.authEnabled));
    renderAll(); updateClock();
  } catch (error) {
    $('#serverDot').classList.remove('ok'); $('#serverText').textContent = 'Server xato';
    if (!/qayta kirish/.test(error.message)) notify(error.message, true);
  }
}

function renderAll() {
  const s = snapshot.settings;
  $('#clipDir').value = s.clipDir || '';
  $('#musicDir').value = s.musicDir || '';
  $('#outputDir').value = s.outputDir || '';
  $('#thumbnailDir').value = s.thumbnailDir || '';
  $('#clipSeconds').value = s.clipSeconds;
  $('#quality').value = s.quality;
  $('#aspect').value = s.aspect;
  $('#resolution').value = s.resolution;
  $('#songMode').value = s.songMode;
  $('#parallelSegments').value = s.parallelSegments;
  $('#keepRendered').checked = s.keepRendered;
  $('#aiProvider').value = s.aiProvider;
  $('#aiLanguage').value = s.aiLanguage;
  $('#schedulerEnabled').checked = s.scheduler.enabled;
  $('#schedulerMode').value = s.scheduler.mode;
  $('#startHour').value = s.scheduler.startHour;
  $('#startMinute').value = s.scheduler.startMinute;
  $('#intervalMinutes').value = s.scheduler.intervalMinutes;
  $('#timezone').value = s.timezone;
  $('#recoveryMode').value = s.scheduler.recoveryMode || 'catch-up-today';
  $('#recoverySpacingMinutes').value = s.scheduler.recoverySpacingMinutes || 10;
  $('#maxCatchUp').value = s.scheduler.maxCatchUp || 6;
  $('#resumeInterrupted').checked = s.scheduler.resumeInterrupted !== false;
  $('#schedBadge').textContent = s.scheduler.enabled ? 'ON' : 'OFF';
  $('#schedBadge').classList.toggle('on', s.scheduler.enabled);
  renderStats(); renderAi(); renderChannels(); renderJobs(); renderLogs(); renderSchedulerInfo();
  if (!$('#scheduledLocal').value) $('#scheduledLocal').value = serverLocalKey(60);
}

function renderStats() {
  const done = snapshot.jobs.filter(j => j.status === 'done').length;
  const failed = snapshot.jobs.filter(j => j.status === 'failed').length;
  const scheduled = snapshot.jobs.filter(j => j.status === 'scheduled').length;
  const active = snapshot.channels.filter(c => c.enabled).length;
  $('#stats').innerHTML = [
    ['Kanallar', snapshot.channels.length], ['Faol', active], ['Yuklangan', done], ['Rejada', scheduled], ['Queue', snapshot.queue.running ? 'Ishlayapti' : 'Bo‘sh']
  ].map(([label,value]) => `<div class="stat"><b>${value}</b><span>${label}</span></div>`).join('');
}

function renderAi() {
  const e = snapshot.env;
  $('#aiInfo').innerHTML = `
    <div class="info-row"><span>Gemini key</span><b>${e.geminiReady ? 'Tayyor' : 'Kiritilmagan'}</b></div>
    <div class="info-row"><span>Gemini model</span><b>${escapeHtml(e.geminiModel)}</b></div>
    <div class="info-row"><span>Ollama model</span><b>${escapeHtml(e.ollamaModel)}</b></div>
    <div class="info-row"><span>Google OAuth</span><b>${e.googleReady ? 'Tayyor' : 'Sozlanmagan'}</b></div>`;
}

function renderSchedulerInfo() {
  const sch = snapshot.scheduler || {};
  const remote = snapshot.remote || {};
  const recentRecovery = (sch.slotHistory || []).filter(x => x.status === 'recovery').slice(-1)[0];
  const urls = (remote.localAddresses || []).map(x => escapeHtml(x)).join('<br>') || '—';
  $('#schedulerInfo').innerHTML = `
    <div class="info-row"><span>Server vaqti</span><b>${escapeHtml(snapshot.time?.localDisplay || '—')}</b></div>
    <div class="info-row"><span>Timezone</span><b>${escapeHtml(snapshot.time?.timezone || '')}</b></div>
    <div class="info-row"><span>Oxirgi scheduler tekshiruvi</span><b>${shortTime(sch.lastTickAt)}</b></div>
    <div class="info-row"><span>Oxirgi recovery</span><b>${recentRecovery ? escapeHtml(recentRecovery.plannedLocal) : '—'}</b></div>
    <div class="info-row"><span>Telefon uchun LAN manzil</span><b>${urls}</b></div>
    <div class="info-row"><span>Panel himoyasi</span><b>${remote.authEnabled ? 'Parol yoqilgan' : 'Parolsiz'}</b></div>`;
}

function renderChannels() {
  const box = $('#channels');
  const manual = $('#manualChannel'); const schedule = $('#scheduleChannel');
  const oldManual = manual.value; const oldSchedule = schedule.value;
  manual.innerHTML = ''; schedule.innerHTML = '';
  if (!snapshot.channels.length) { box.className = 'channels empty'; box.textContent = 'Kanal hali ulanmagan.'; return; }
  box.className = 'channels'; box.innerHTML = '';
  const tpl = $('#channelTemplate');
  snapshot.channels.sort((a,b)=>(a.order||0)-(b.order||0)).forEach(ch => {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.dataset.id = ch.channelId;
    node.querySelector('.avatar').src = ch.thumbnail || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="100%" height="100%" fill="%23152640"/></svg>';
    node.querySelector('.channel-title').textContent = ch.title;
    node.querySelector('.channel-handle').textContent = ch.handle || ch.channelId;
    node.querySelector('.channel-stat').textContent = `${num(ch.subscribers)} obunachi • ${num(ch.videoCount)} video • oxirgi: ${shortTime(ch.lastUploadAt)}`;
    node.querySelector('.channel-enabled').checked = ch.enabled;
    node.querySelector('.channel-order').value = ch.order ?? 0;
    node.querySelector('.channel-privacy').value = ch.privacyStatus || 'private';
    node.querySelector('.channel-daily').value = ch.dailyMax || 1;
    node.querySelector('.channel-category').value = ch.categoryId || '10';
    node.querySelector('.channel-title-template').value = ch.titleTemplate || '{song} | Official Music';
    node.querySelector('.channel-desc-template').value = ch.descriptionTemplate || '{song}\n\n#music';
    node.querySelector('.channel-tags').value = (ch.tags || []).join(', ');
    node.querySelector('.save-channel').onclick = () => saveChannel(node);
    node.querySelector('.refresh-channel').onclick = () => action(`/api/channels/${encodeURIComponent(ch.channelId)}/refresh`, 'POST', null, 'Kanal statistikasi yangilandi');
    node.querySelector('.remove-channel').onclick = async () => { if (confirm(`${ch.title} kanalini dasturdan uzasizmi?`)) await action(`/api/channels/${encodeURIComponent(ch.channelId)}`, 'DELETE', null, 'Kanal uzildi'); };
    box.appendChild(node);
    for (const select of [manual, schedule]) {
      const option = document.createElement('option'); option.value = ch.channelId; option.textContent = ch.title; select.appendChild(option);
    }
  });
  if ([...manual.options].some(o => o.value === oldManual)) manual.value = oldManual;
  if ([...schedule.options].some(o => o.value === oldSchedule)) schedule.value = oldSchedule;
}

async function saveChannel(node) {
  const id = node.dataset.id;
  const body = {
    enabled: node.querySelector('.channel-enabled').checked,
    order: Number(node.querySelector('.channel-order').value),
    privacyStatus: node.querySelector('.channel-privacy').value,
    dailyMax: Number(node.querySelector('.channel-daily').value),
    categoryId: node.querySelector('.channel-category').value,
    titleTemplate: node.querySelector('.channel-title-template').value,
    descriptionTemplate: node.querySelector('.channel-desc-template').value,
    tags: node.querySelector('.channel-tags').value.split(',').map(x => x.trim()).filter(Boolean)
  };
  await action(`/api/channels/${encodeURIComponent(id)}`, 'PATCH', body, 'Kanal sozlamasi saqlandi');
}

function renderJobs() {
  const jobs = snapshot.jobs;
  if (!jobs.length) { $('#jobs').innerHTML = '<div class="muted">Job hali yo‘q.</div>'; return; }
  $('#jobs').innerHTML = `<table class="jobs-table"><thead><tr><th>Vaqt / reja</th><th>Kanal</th><th>Trigger</th><th>Status</th><th>Progress</th><th>Musiqa</th><th>Natija</th></tr></thead><tbody>${jobs.map(j => `<tr>
    <td>${shortTime(j.createdAt)}${j.scheduledLocal ? `<br><small>🗓 ${escapeHtml(j.scheduledLocal)}</small>`:''}${j.plannedLocal ? `<br><small>⏱ ${escapeHtml(j.plannedLocal)}</small>`:''}</td>
    <td>${escapeHtml(j.channelTitle||j.channelId)}</td><td>${escapeHtml(j.trigger||'')}</td>
    <td class="status-${j.status}">${escapeHtml(j.status)}${j.recovering ? '<br><small>♻ recovery</small>':''}${j.error ? `<br><small>${escapeHtml(j.error)}</small>`:''}</td>
    <td><div class="progress"><i style="width:${Math.max(0,Math.min(100,j.progress||0))}%"></i></div><small>${j.progress||0}% • ${escapeHtml(j.stage||'')}</small></td>
    <td>${escapeHtml(j.songName||'—')}</td><td>${j.youtubeUrl ? `<a href="${j.youtubeUrl}" target="_blank" rel="noreferrer">YouTube ↗</a>` : '—'}${['failed','interrupted'].includes(j.status) ? `<br><button class="secondary retry" data-id="${j.id}">Retry</button>`:''}${['scheduled','queued'].includes(j.status) ? `<br><button class="danger cancel-job" data-id="${j.id}">Bekor</button>`:''}</td>
  </tr>`).join('')}</tbody></table>`;
  $$('.retry').forEach(b => b.onclick = () => action(`/api/jobs/${encodeURIComponent(b.dataset.id)}/retry`, 'POST', null, 'Qayta navbatga qo‘shildi'));
  $$('.cancel-job').forEach(b => b.onclick = () => action(`/api/jobs/${encodeURIComponent(b.dataset.id)}/cancel`, 'POST', null, 'Job bekor qilindi'));
}

function renderLogs() {
  $('#logs').textContent = snapshot.logs.map(l => `${l.at} [${String(l.level).toUpperCase()}] ${l.message}`).join('\n') || 'Log yo‘q.';
}

function settingsBody() {
  return {
    clipDir: $('#clipDir').value, musicDir: $('#musicDir').value, outputDir: $('#outputDir').value, thumbnailDir: $('#thumbnailDir').value,
    clipSeconds: Number($('#clipSeconds').value), quality: $('#quality').value, aspect: $('#aspect').value, resolution: $('#resolution').value,
    songMode: $('#songMode').value, parallelSegments: Number($('#parallelSegments').value), keepRendered: $('#keepRendered').checked,
    aiProvider: $('#aiProvider').value, aiLanguage: $('#aiLanguage').value, timezone: $('#timezone').value,
    scheduler: {
      enabled: $('#schedulerEnabled').checked, mode: $('#schedulerMode').value,
      startHour: Number($('#startHour').value), startMinute: Number($('#startMinute').value), intervalMinutes: Number($('#intervalMinutes').value),
      recoveryMode: $('#recoveryMode').value, recoverySpacingMinutes: Number($('#recoverySpacingMinutes').value),
      maxCatchUp: Number($('#maxCatchUp').value), resumeInterrupted: $('#resumeInterrupted').checked
    }
  };
}

async function action(url, method='POST', body=null, success='Bajarildi') {
  try { await api(url,{method,body}); notify(success); await refresh(); }
  catch(error){ if (!/qayta kirish/.test(error.message)) notify(error.message,true); }
}

$('#loginBtn').onclick = login;
$('#loginPassword').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
$('#logoutBtn').onclick = async () => { await rawJson('/api/logout', {method:'POST'}); showLogin(); };
$('#refreshBtn').onclick = refresh;
$('#saveSettingsBtn').onclick = () => action('/api/settings','PUT',settingsBody(),'Sozlamalar saqlandi');
$('#saveSchedulerBtn').onclick = () => action('/api/settings','PUT',settingsBody(),'Scheduler va recovery saqlandi');
$('#scanBtn').onclick = async () => { try{const x=await api('/api/scan'); $('#scanResult').textContent=`${x.clips} clip • ${x.songs} musiqa`; notify('Media skanerlandi');}catch(e){notify(e.message,true);} };
$('#runManualBtn').onclick = () => action('/api/jobs/enqueue','POST',{channelId:$('#manualChannel').value},'Render + upload navbatga qo‘shildi');
$('#runNextBtn').onclick = () => action('/api/scheduler/run-next','POST',null,'Scheduler keyingi kanalni ishga tushirdi');
$('#scheduleBtn').onclick = () => action('/api/jobs/schedule','POST',{channelId:$('#scheduleChannel').value,scheduledLocal:$('#scheduledLocal').value},'Video aniq vaqtga rejalashtirildi');
$('#aiTestBtn').onclick = async () => { try{await api('/api/settings',{method:'PUT',body:settingsBody()}); const x=await api('/api/ai/test',{method:'POST',body:{songName:'Demo Track 2026'}}); $('#aiResult').textContent=JSON.stringify(x,null,2); notify('AI ishladi');}catch(e){$('#aiResult').textContent=e.message;notify(e.message,true);} };
$('#doctorBtn').onclick = async () => { try{const x=await api('/api/doctor'); $('#doctor').innerHTML=x.checks.map(c=>`<div class="check"><span>${escapeHtml(c.name)}<br><small>${escapeHtml(c.detail)}</small></span><b class="${c.ok?'oktxt':'bad'}">${c.ok?'OK':'XATO'}</b></div>`).join('');}catch(e){notify(e.message,true);} };
$$('[data-pick]').forEach(btn => btn.onclick = async () => { try{const id=btn.dataset.pick; const x=await api('/api/pick-folder',{method:'POST',body:{title:`${id} uchun papka tanlang`}}); if(x.path) $('#'+id).value=x.path;}catch(e){notify(e.message,true);} });

function escapeHtml(value=''){return String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; $('#installBtn').classList.remove('hidden'); });
$('#installBtn').onclick = async () => { if (!deferredInstall) return; deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; $('#installBtn').classList.add('hidden'); };
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

function connectivity() {
  let b = $('#offlineBanner');
  if (!navigator.onLine) {
    if (!b) { b = document.createElement('div'); b.id='offlineBanner'; b.className='offline-banner'; b.textContent='Internet yo‘q — server qaytganda tarix/reja davom etadi'; document.body.appendChild(b); }
  } else b?.remove();
}
window.addEventListener('online', () => { connectivity(); refresh(); });
window.addEventListener('offline', connectivity);

async function bootstrap() {
  connectivity();
  const { response, body } = await rawJson('/api/session').catch(() => ({ response:{ok:false}, body:{} }));
  if (response.ok && body.authRequired && !body.authenticated) showLogin();
  else { showApp(Boolean(body.authRequired)); await refresh(); }
  const qs = new URLSearchParams(location.search);
  if(qs.get('oauth')==='connected') notify('YouTube kanal muvaffaqiyatli ulandi');
  if(qs.get('oauth')==='error') notify(qs.get('message')||'OAuth xatosi',true);
}

bootstrap();
setInterval(() => { if (!$('#appMain').classList.contains('hidden')) refresh(); }, 8000);
setInterval(updateClock, 1000);
