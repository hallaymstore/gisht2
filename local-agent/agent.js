require('dotenv').config();
const fs=require('fs');
const fsp=fs.promises;
const path=require('path');
const os=require('os');
const express=require('express');
const {renderOne}=require('../src/mixer');
const {scanFiles,VIDEO_EXTENSIONS,AUDIO_EXTENSIONS,availableBytes}=require('../src/media');
const {pickFolder}=require('../src/folder-picker');
const {pickThumbnail}=require('../src/thumbnails');
const {generateMetadata}=require('../src/ai');
const {uploadDirect}=require('./upload');

const APP_VERSION='2.0.0';
const ROOT=__dirname;
const DATA=path.join(ROOT,'data');
const CONFIG_FILE=path.join(DATA,'config.json');
const HISTORY_FILE=path.join(DATA,'history.json');
const CLOUD_BACKUP_FILE=path.join(DATA,'cloud-recovery.json');
const POOL_FILE=path.join(DATA,'ready-pool.json');
const PORT=Number(process.env.LOCAL_AGENT_PORT||3940);

let stopping=false,lastError='',remoteSnapshot=null,lastRecoverySyncAt=0;
let recoveryStatus={source:'none',channels:0,at:null,error:''};
let scanCache={at:0,clips:0,songs:0,freeGb:0};
let uploadBusy=false,activeCommandId=null,activeUploadAbort=null;
const renderJobs=new Map();
let poolLock=Promise.resolve();
let configLock=Promise.resolve();

function defaults(){
  const out=path.join(os.homedir(),'Videos','AutoMixYouTubeAI');
  return{
    deviceId:`${os.hostname()}-${Math.random().toString(36).slice(2,8)}`,name:os.hostname(),serverUrl:'https://automix-youtube-ai.onrender.com',agentKey:'',enabled:true,
    clipDir:'',musicDir:'',outputDir:out,readyDir:path.join(out,'Ready'),thumbnailDir:'',
    aspect:'landscape',resolution:'1080',fit:'cover',quality:'balanced',parallelSegments:2,minFreeGb:3,keepRendered:true,
    songMode:'ordered',nextSongIndex:0,timezone:'Asia/Samarkand',aiProvider:'template',aiLanguage:'English',pollSeconds:10,
    factoryEnabled:false,renderWorkers:2,readyTarget:12,maxReady:36
  };
}
async function readJson(file,fallback){try{return JSON.parse(await fsp.readFile(file,'utf8'))}catch{return fallback}}
async function writeJson(file,value){await fsp.mkdir(DATA,{recursive:true});const tmp=`${file}.${process.pid}.tmp`;await fsp.writeFile(tmp,JSON.stringify(value,null,2));await fsp.rename(tmp,file)}
async function loadConfig(){const raw=await readJson(CONFIG_FILE,null);const cfg={...defaults(),...(raw||{})};if(!cfg.readyDir)cfg.readyDir=path.join(cfg.outputDir,'Ready');if(!raw)await writeJson(CONFIG_FILE,cfg);return cfg}
async function saveConfig(cfg){await writeJson(CONFIG_FILE,cfg);return cfg}
function withConfigLock(fn){const task=configLock.then(fn,fn);configLock=task.catch(()=>{});return task}
function withPoolLock(fn){const task=poolLock.then(fn,fn);poolLock=task.catch(()=>{});return task}

async function api(cfg,route,options={}){
  const base=String(cfg.serverUrl||'').replace(/\/$/,'');
  if(!base)throw new Error('Render server URL kiritilmagan');
  if(!cfg.agentKey)throw new Error('Agent pairing key kiritilmagan');
  const r=await fetch(`${base}${route}`,{...options,headers:{'content-type':'application/json','x-agent-key':cfg.agentKey,...(options.headers||{})},body:options.body&&typeof options.body!=='string'?JSON.stringify(options.body):options.body,signal:AbortSignal.timeout(options.timeout||30000)});
  const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(body.error||`Cloud HTTP ${r.status}`);return body;
}
async function syncCloudRecovery(cfg,force=false){
  if(!force&&Date.now()-lastRecoverySyncAt<45000)return recoveryStatus;
  lastRecoverySyncAt=Date.now();
  try{
    let cloud=await api(cfg,'/worker/recovery');const local=await readJson(CLOUD_BACKUP_FILE,null);
    if(Array.isArray(cloud.channels)&&cloud.channels.length){await writeJson(CLOUD_BACKUP_FILE,cloud);recoveryStatus={source:'cloud-backup',channels:cloud.channels.length,at:new Date().toISOString(),error:''};return recoveryStatus}
    if(local&&Array.isArray(local.channels)&&local.channels.length){await api(cfg,'/worker/recovery/restore',{method:'POST',body:local,timeout:45000});cloud=await api(cfg,'/worker/recovery');if(Array.isArray(cloud.channels)&&cloud.channels.length)await writeJson(CLOUD_BACKUP_FILE,cloud);recoveryStatus={source:'pc-restored',channels:cloud.channels?.length||local.channels.length,at:new Date().toISOString(),error:''};return recoveryStatus}
    recoveryStatus={source:'empty',channels:0,at:new Date().toISOString(),error:''};return recoveryStatus;
  }catch(error){recoveryStatus={...recoveryStatus,at:new Date().toISOString(),error:error.message};throw error}
}
async function refreshRemote(cfg){await syncCloudRecovery(cfg).catch(()=>{});remoteSnapshot=await api(cfg,'/worker/config');return remoteSnapshot}
function factorySettings(cfg){const cloud=remoteSnapshot?.settings?.factory||{};return{enabled:cloud.enabled??cfg.factoryEnabled,renderWorkers:Math.max(1,Math.min(3,Number(cloud.renderWorkers||cfg.renderWorkers||2))),readyTarget:Math.max(1,Number(cloud.readyTarget||cfg.readyTarget||12)),maxReady:Math.max(1,Number(cloud.maxReady||cfg.maxReady||36)),pollSeconds:Math.max(2,Number(cloud.pollSeconds||5)),consumeMode:cloud.consumeMode||'oldest'}}

async function folderDiagnostics(root,maxFiles=5000){const result={exists:false,isDirectory:false,totalFiles:0,extensions:{},error:''};if(!root){result.error='Papka tanlanmagan';return result}try{const st=await fsp.stat(root);result.exists=true;result.isDirectory=st.isDirectory();if(!st.isDirectory()){result.error='Bu papka emas';return result}const pending=[path.resolve(root)];while(pending.length&&result.totalFiles<maxFiles){const dir=pending.pop();let entries;try{entries=await fsp.readdir(dir,{withFileTypes:true})}catch(e){if(dir===path.resolve(root))throw e;continue}for(const entry of entries){const abs=path.join(dir,entry.name);if(entry.isDirectory()){if(!entry.name.startsWith('.'))pending.push(abs)}else if(entry.isFile()){result.totalFiles++;const ext=(path.extname(entry.name)||'(kengaytmasiz)').toLowerCase();result.extensions[ext]=(result.extensions[ext]||0)+1;if(result.totalFiles>=maxFiles)break}}}}catch(e){result.error=e.message}return result}
async function scanLocal(cfg,force=false){if(!force&&Date.now()-scanCache.at<30000)return scanCache;const [clipScan,songScan,clipDiag,musicDiag]=await Promise.all([scanFiles(cfg.clipDir,VIDEO_EXTENSIONS).then(files=>({files,error:''})).catch(error=>({files:[],error:error.message})),scanFiles(cfg.musicDir,AUDIO_EXTENSIONS).then(files=>({files,error:''})).catch(error=>({files:[],error:error.message})),folderDiagnostics(cfg.clipDir),folderDiagnostics(cfg.musicDir)]);let freeGb=0;try{freeGb=(await availableBytes(cfg.outputDir))/1024**3}catch{}scanCache={at:Date.now(),clips:clipScan.files.length,songs:songScan.files.length,freeGb:Math.round(freeGb*10)/10,clipError:clipScan.error||clipDiag.error,musicError:songScan.error||musicDiag.error,clipExists:clipDiag.exists,musicExists:musicDiag.exists,clipTotalFiles:clipDiag.totalFiles,musicTotalFiles:musicDiag.totalFiles,clipExtensions:clipDiag.extensions,musicExtensions:musicDiag.extensions,clipExamples:clipScan.files.slice(0,5).map(x=>path.basename(x)),songExamples:songScan.files.slice(0,5).map(x=>path.basename(x))};return scanCache}

async function normalizePool(cfg){
  return withPoolLock(async()=>{
    await fsp.mkdir(cfg.readyDir,{recursive:true});
    let pool=await readJson(POOL_FILE,[]);if(!Array.isArray(pool))pool=[];
    pool=pool.filter(x=>x?.file&&fs.existsSync(x.file));
    const known=new Set(pool.map(x=>path.resolve(x.file)));
    const entries=await fsp.readdir(cfg.readyDir,{withFileTypes:true}).catch(()=>[]);
    for(const e of entries){if(!e.isFile()||path.extname(e.name).toLowerCase()!=='.mp4')continue;const file=path.join(cfg.readyDir,e.name);if(!known.has(path.resolve(file)))pool.push({id:`ready_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,file,songName:path.basename(e.name,'.mp4'),duration:0,status:'ready',createdAt:(await fsp.stat(file)).birthtime?.toISOString?.()||new Date().toISOString()})}
    await writeJson(POOL_FILE,pool);return pool;
  });
}
async function poolSnapshot(cfg){const pool=await normalizePool(cfg);return{items:pool,ready:pool.filter(x=>x.status==='ready').length,reserved:pool.filter(x=>x.status==='reserved').length}}
async function addReady(cfg,mix){return withPoolLock(async()=>{let pool=await readJson(POOL_FILE,[]);if(!Array.isArray(pool))pool=[];const item={id:`ready_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,file:mix.outputFile,songName:mix.songName,duration:mix.duration||0,status:'ready',createdAt:new Date().toISOString(),sourceClips:mix.sourceClips||[]};pool.push(item);await writeJson(POOL_FILE,pool);return item})}
async function reserveReady(cfg,commandId){return withPoolLock(async()=>{let pool=await normalizePoolUnlocked(cfg);const mode=factorySettings(cfg).consumeMode;let candidates=pool.filter(x=>x.status==='ready');if(!candidates.length)return null;if(mode==='random')candidates=candidates.sort(()=>Math.random()-.5);else candidates.sort((a,b)=>Date.parse(a.createdAt||0)-Date.parse(b.createdAt||0));const item=candidates[0];const actual=pool.find(x=>x.id===item.id);actual.status='reserved';actual.reservedBy=commandId;actual.reservedAt=new Date().toISOString();await writeJson(POOL_FILE,pool);return actual})}
async function normalizePoolUnlocked(cfg){await fsp.mkdir(cfg.readyDir,{recursive:true});let pool=await readJson(POOL_FILE,[]);if(!Array.isArray(pool))pool=[];pool=pool.filter(x=>x?.file&&fs.existsSync(x.file));return pool}
async function releaseReady(itemId){return withPoolLock(async()=>{let pool=await readJson(POOL_FILE,[]);const item=pool.find(x=>x.id===itemId);if(item){item.status='ready';delete item.reservedBy;delete item.reservedAt}await writeJson(POOL_FILE,pool)})}
async function consumeReady(cfg,item,uploaded){return withPoolLock(async()=>{let pool=await readJson(POOL_FILE,[]);pool=pool.filter(x=>x.id!==item.id);await writeJson(POOL_FILE,pool);if(cfg.keepRendered){const dir=path.join(cfg.outputDir,'Uploaded');await fsp.mkdir(dir,{recursive:true});const target=path.join(dir,path.basename(item.file));try{await fsp.rename(item.file,target)}catch{}}else await fsp.rm(item.file,{force:true}).catch(()=>{});return uploaded})}

async function reserveSongIndex(){return withConfigLock(async()=>{const cfg=await loadConfig();const index=Math.max(0,Number(cfg.nextSongIndex||0));if(cfg.songMode==='ordered'){cfg.nextSongIndex=index+1;await saveConfig(cfg)}return index})}
async function renderFactoryItem(cfg,workerNo){
  const id=`render_${Date.now()}_${workerNo}_${Math.random().toString(36).slice(2,6)}`;const controller=new AbortController();renderJobs.set(id,{id,workerNo,startedAt:new Date().toISOString(),progress:0,stage:'start',controller});
  try{
    await fsp.mkdir(cfg.readyDir,{recursive:true});
    const index=await reserveSongIndex();
    const settings={...cfg,outputDir:cfg.readyDir};
    const localState={settings:{nextSongIndex:index}};
    const mix=await renderOne({settings,state:localState,signal:controller.signal,log:()=>{},onProgress:(p,stage)=>{const j=renderJobs.get(id);if(j){j.progress=p;j.stage=stage}}});
    await addReady(cfg,mix);lastError='';return mix;
  }catch(error){if(!/abort|to‘xtat/i.test(error.message||''))lastError=`Factory: ${error.message}`;throw error}
  finally{renderJobs.delete(id)}
}
async function factoryTick(){
  if(stopping)return;
  let cfg;
  try{
    cfg=await loadConfig();if(!cfg.enabled)return;
    if(cfg.agentKey&&cfg.serverUrl)await refreshRemote(cfg).catch(()=>{});
    const f=factorySettings(cfg);if(!f.enabled)return;
    const pool=await poolSnapshot(cfg);
    const total=pool.ready+pool.reserved+renderJobs.size;
    const need=Math.max(0,Math.min(f.maxReady,f.readyTarget)-total);
    const slots=Math.max(0,f.renderWorkers-renderJobs.size);
    const start=Math.min(need,slots);
    for(let i=0;i<start;i++)renderFactoryItem(cfg,renderJobs.size+i+1).catch(()=>{});
  }catch(error){lastError=error.message}
  finally{const delay=Math.max(2,Number(factorySettings(cfg||defaults()).pollSeconds||5))*1000;setTimeout(factoryTick,delay)}
}

async function heartbeat(cfg,status='online',currentCommandId=null){const s=await scanLocal(cfg);const p=await poolSnapshot(cfg).catch(()=>({ready:0}));const f=factorySettings(cfg);return api(cfg,'/worker/heartbeat',{method:'POST',body:{deviceId:cfg.deviceId,name:cfg.name,platform:`${os.platform()} ${os.release()}`,appVersion:APP_VERSION,status,currentCommandId,clips:s.clips,songs:s.songs,freeGb:s.freeGb,readyCount:p.ready,renderingCount:renderJobs.size,factoryEnabled:f.enabled,clipDir:cfg.clipDir,musicDir:cfg.musicDir,outputDir:cfg.outputDir,thumbnailDir:cfg.thumbnailDir,readyDir:cfg.readyDir,lastError}})}
async function report(cfg,id,patch){return api(cfg,`/worker/report/${encodeURIComponent(id)}`,{method:'POST',body:patch})}
async function appendHistory(item){const list=await readJson(HISTORY_FILE,[]);list.push(item);if(list.length>500)list.splice(0,list.length-500);await writeJson(HISTORY_FILE,list)}
async function checkCancelled(cfg,commandId,controller){try{const state=await report(cfg,commandId,{});if(state.status==='cancel_requested'&&!controller.signal.aborted)controller.abort(new Error('Telefondan to‘xtatildi'))}catch{}}

async function waitForReady(cfg,command,controller){
  for(let i=0;i<720;i++){
    if(controller.signal.aborted)throw controller.signal.reason||new Error('To‘xtatildi');
    const item=await reserveReady(cfg,command.id);if(item)return item;
    await report(cfg,command.id,{status:'waiting_ready',stage:'Tayyor video kutilmoqda',progress:3}).catch(()=>{});
    await new Promise(r=>setTimeout(r,5000));await checkCancelled(cfg,command.id,controller);
  }
  throw new Error('2 soat ichida tayyor video topilmadi');
}

async function uploadReadyCommand(cfg,command,controller){
  await refreshRemote(cfg);const channel=remoteSnapshot.channels.find(c=>c.channelId===command.channelId);if(!channel)throw new Error('Cloud kanal topilmadi');
  const item=await waitForReady(cfg,command,controller);
  try{
    await report(cfg,command.id,{status:'metadata',stage:'Tayyor videodan metadata yaratilmoqda',progress:10,songName:item.songName});
    const settings={...cfg,timezone:remoteSnapshot.settings?.timezone||cfg.timezone,aiProvider:cfg.aiProvider||remoteSnapshot.settings?.aiProvider||'template',aiLanguage:cfg.aiLanguage||remoteSnapshot.settings?.aiLanguage||'English'};
    const metadata=await generateMetadata({songName:item.songName||'Track',channel,settings});
    const thumbnailFile=await pickThumbnail(cfg.thumbnailDir).catch(()=>null);
    await report(cfg,command.id,{status:'uploading',stage:'Ready pool → YouTube',progress:18,songName:item.songName});
    const token=await api(cfg,`/worker/token/${encodeURIComponent(channel.channelId)}`);
    const uploaded=await uploadDirect({accessToken:token.accessToken,channel,videoFile:item.file,thumbnailFile,metadata,recovering:false,signal:controller.signal,onProgress:p=>report(cfg,command.id,{status:'uploading',stage:'YouTube upload',progress:18+Math.round(p*.81)}).catch(()=>{})});
    await report(cfg,command.id,{status:'done',stage:'Joylandi',progress:100,songName:item.songName,youtubeId:uploaded.videoId,youtubeUrl:uploaded.url});
    await appendHistory({commandId:command.id,channelId:channel.channelId,channelTitle:channel.title,songName:item.songName,youtubeId:uploaded.videoId,youtubeUrl:uploaded.url,sourceFile:item.file,completedAt:new Date().toISOString(),mode:'ready-pool'});
    await consumeReady(cfg,item,uploaded);lastError='';
  }catch(error){await releaseReady(item.id).catch(()=>{});throw error}
}

async function legacyRenderUpload(cfg,command,controller){
  await refreshRemote(cfg);const channel=remoteSnapshot.channels.find(c=>c.channelId===command.channelId);if(!channel)throw new Error('Cloud kanal topilmadi');
  await report(cfg,command.id,{status:'rendering',stage:'Bir martalik video tayyorlanmoqda',progress:2});
  const index=await reserveSongIndex();const mix=await renderOne({settings:{...cfg,outputDir:cfg.outputDir},state:{settings:{nextSongIndex:index}},signal:controller.signal,log:()=>{},onProgress:(p,stage)=>report(cfg,command.id,{status:'rendering',stage:`Render: ${stage}`,progress:Math.min(60,Math.round(p*.6))}).catch(()=>{})});
  const settings={...cfg,timezone:remoteSnapshot.settings?.timezone||cfg.timezone};const metadata=await generateMetadata({songName:mix.songName||'Track',channel,settings});const thumbnailFile=await pickThumbnail(cfg.thumbnailDir).catch(()=>null);const token=await api(cfg,`/worker/token/${encodeURIComponent(channel.channelId)}`);await report(cfg,command.id,{status:'uploading',stage:'YouTube upload',progress:68,songName:mix.songName});const uploaded=await uploadDirect({accessToken:token.accessToken,channel,videoFile:mix.outputFile,thumbnailFile,metadata,signal:controller.signal,onProgress:p=>report(cfg,command.id,{status:'uploading',stage:'YouTube upload',progress:68+Math.round(p*.31)}).catch(()=>{})});await report(cfg,command.id,{status:'done',stage:'Tayyor',progress:100,songName:mix.songName,youtubeId:uploaded.videoId,youtubeUrl:uploaded.url});await appendHistory({commandId:command.id,channelTitle:channel.title,songName:mix.songName,youtubeUrl:uploaded.url,completedAt:new Date().toISOString(),mode:'legacy'});if(!cfg.keepRendered)await fsp.rm(mix.outputFile,{force:true}).catch(()=>{});
}

async function processCommand(cfg,command){
  if(uploadBusy)throw new Error('Upload worker band');uploadBusy=true;activeCommandId=command.id;const controller=new AbortController();activeUploadAbort=controller;let watch;
  try{
    watch=setInterval(()=>checkCancelled(cfg,command.id,controller),1500);
    await heartbeat(cfg,'upload-worker',command.id).catch(()=>{});
    if(command.type==='upload-ready')await uploadReadyCommand(cfg,command,controller);else await legacyRenderUpload(cfg,command,controller);
  }catch(error){const cancelled=controller.signal.aborted||/to‘xtat|to'xtat|abort/i.test(error.message||'');lastError=cancelled?'':error.message;if(cancelled)await report(cfg,command.id,{status:'cancelled',stage:'To‘xtatildi',error:''}).catch(()=>{});else await report(cfg,command.id,{status:'failed',stage:'Xato',error:error.message}).catch(()=>{});if(!cancelled)await appendHistory({commandId:command.id,channelTitle:command.channelTitle,status:'failed',error:error.message,failedAt:new Date().toISOString()});}
  finally{if(watch)clearInterval(watch);activeUploadAbort=null;activeCommandId=null;uploadBusy=false;await heartbeat(cfg,'online',null).catch(()=>{})}
}

async function commandPoll(){
  if(stopping)return;let cfg;
  try{cfg=await loadConfig();if(!cfg.enabled||!cfg.agentKey||!cfg.serverUrl)return;await refreshRemote(cfg).catch(()=>{});await heartbeat(cfg,uploadBusy?'upload-worker':renderJobs.size?'rendering':'online',activeCommandId);if(uploadBusy)return;const claimed=await api(cfg,'/worker/claim',{method:'POST',body:{deviceId:cfg.deviceId}});if(claimed.command)processCommand(cfg,claimed.command).catch(()=>{})}catch(error){lastError=error.message}
  finally{if(!stopping)setTimeout(commandPoll,Math.max(5,Number(cfg?.pollSeconds||10))*1000)}
}

const app=express();app.use(express.json({limit:'1mb'}));app.use(express.static(path.join(ROOT,'public')));
app.get('/healthz',(_req,res)=>res.status(200).send('ok'));
app.get('/api/status',async(_req,res)=>{const cfg=await loadConfig();const scan=await scanLocal(cfg);const hist=await readJson(HISTORY_FILE,[]);const pool=await poolSnapshot(cfg);const f=factorySettings(cfg);res.json({version:APP_VERSION,busy:uploadBusy||renderJobs.size>0,uploadBusy,currentCommandId:activeCommandId,lastError,config:{...cfg,agentKey:cfg.agentKey?'***set***':''},scan,remote:remoteSnapshot,history:hist.slice(-80).reverse(),recovery:recoveryStatus,factory:{...f,rendering:renderJobs.size,renderJobs:[...renderJobs.values()].map(({controller,...x})=>x),ready:pool.ready,reserved:pool.reserved,total:pool.items.length,readyDir:cfg.readyDir},hasCloudBackup:Boolean((await readJson(CLOUD_BACKUP_FILE,null))?.channels?.length)})});
app.get('/api/config',async(_req,res)=>{const cfg=await loadConfig();res.json({...cfg,agentKey:'',hasAgentKey:Boolean(cfg.agentKey)})});
app.put('/api/config',async(req,res)=>{const cfg=await loadConfig();const inb=req.body||{};for(const k of ['name','serverUrl','clipDir','musicDir','outputDir','readyDir','thumbnailDir','aspect','resolution','quality','fit','songMode','timezone','aiProvider','aiLanguage'])if(typeof inb[k]==='string')cfg[k]=inb[k].trim();for(const k of ['parallelSegments','minFreeGb','pollSeconds','renderWorkers','readyTarget','maxReady'])if(Number.isFinite(Number(inb[k])))cfg[k]=Number(inb[k]);for(const k of ['enabled','keepRendered','factoryEnabled'])if(typeof inb[k]==='boolean')cfg[k]=inb[k];if(typeof inb.agentKey==='string'&&inb.agentKey.trim())cfg.agentKey=inb.agentKey.trim();if(!cfg.readyDir)cfg.readyDir=path.join(cfg.outputDir,'Ready');await saveConfig(cfg);scanCache.at=0;lastRecoverySyncAt=0;res.json({ok:true})});
app.post('/api/pick-folder',async(req,res)=>{try{res.json({path:await pickFolder(req.body?.title||'Papka tanlang')})}catch(e){res.status(400).json({error:e.message})}});
app.get('/api/scan',async(_req,res)=>{try{const cfg=await loadConfig();res.json(await scanLocal(cfg,true))}catch(e){res.status(400).json({error:e.message})}});
app.post('/api/test-cloud',async(_req,res)=>{try{const cfg=await loadConfig();const r=await refreshRemote(cfg);await heartbeat(cfg,'online',activeCommandId);res.json({ok:true,channels:r.channels.length,serverTime:r.time,recovery:recoveryStatus})}catch(e){res.status(400).json({error:e.message})}});
app.post('/api/stop',async(_req,res)=>{activeUploadAbort?.abort(new Error('Kompyuterdan to‘xtatildi'));for(const j of renderJobs.values())j.controller.abort(new Error('Kompyuterdan factory to‘xtatildi'));res.json({ok:true,stoppedUpload:Boolean(activeUploadAbort),stoppedRenders:renderJobs.size})});

const server=app.listen(PORT,'127.0.0.1',async()=>{console.log(`AutoMix Local Agent v${APP_VERSION}: http://127.0.0.1:${PORT}`);const cfg=await loadConfig();if(cfg.agentKey&&cfg.serverUrl)await refreshRemote(cfg).catch(()=>{});commandPoll();factoryTick()});
server.on('error',error=>{console.error(`[LOCAL SERVER XATO] ${error.code||''} ${error.message}`);if(error.code==='EADDRINUSE')console.error('3940 port band. Boshqa AutoMix Agent oynasini yoping.')});
process.on('SIGINT',()=>{stopping=true;activeUploadAbort?.abort(new Error('Agent yopilmoqda'));for(const j of renderJobs.values())j.controller.abort(new Error('Agent yopilmoqda'));server.close(()=>process.exit(0))});
process.on('SIGTERM',()=>{stopping=true;activeUploadAbort?.abort(new Error('Agent yopilmoqda'));for(const j of renderJobs.values())j.controller.abort(new Error('Agent yopilmoqda'));server.close(()=>process.exit(0))});
