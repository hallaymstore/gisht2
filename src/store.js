const fs=require('fs');
const fsp=fs.promises;
const path=require('path');
const os=require('os');
const {clamp,nowIso}=require('./utils');
const r2=require('./r2');

const DATA_DIR=path.resolve(process.env.DATA_DIR||path.resolve(__dirname,'..','data'));
const MONGODB_URI=process.env.MONGODB_URI||'';
const MONGODB_DB=process.env.MONGODB_DB||process.env.MONGODB_DB_NAME||'automix_youtube_ai';
const MONGODB_COLLECTION=process.env.MONGODB_COLLECTION||'automix_state';
let mongoClient=null,mongoDb=null,mongoReady=null,lastDbError='';

async function ensureMongo(){
  if(!MONGODB_URI)return null;
  if(mongoDb)return mongoDb;
  if(!mongoReady)mongoReady=(async()=>{
    const {MongoClient}=require('mongodb');
    mongoClient=new MongoClient(MONGODB_URI,{maxPoolSize:5,minPoolSize:0,serverSelectionTimeoutMS:10000,connectTimeoutMS:10000,retryWrites:true});
    await mongoClient.connect();
    mongoDb=mongoClient.db(MONGODB_DB);
    await mongoDb.command({ping:1});
    lastDbError='';
    console.log(`MongoDB ulandi: ${MONGODB_DB}`);
    return mongoDb;
  })().catch(error=>{mongoReady=null;mongoDb=null;lastDbError=error.message;throw error;});
  return mongoReady;
}
function stateCollection(db){return db.collection(MONGODB_COLLECTION)}

const STATE_FILE=path.join(DATA_DIR,'state.json');
const BACKUP_FILE=path.join(DATA_DIR,'state.json.bak');

function defaultState(){
  return{
    version:6,
    settings:{
      clipDir:'',musicDir:'',outputDir:path.join(os.homedir(),'Videos','AutoMixYouTubeAI'),thumbnailDir:'',clipSeconds:5,
      aspect:'landscape',resolution:'1080',fit:'cover',quality:'balanced',parallelSegments:2,minFreeGb:3,keepRendered:true,
      songMode:'ordered',nextSongIndex:0,timezone:'Asia/Samarkand',aiProvider:process.env.AI_PROVIDER||'gemini',aiLanguage:'English',
      factory:{enabled:false,renderWorkers:2,readyTarget:12,maxReady:36,pollSeconds:5,consumeMode:'oldest'},
      scheduler:{enabled:false,mode:'once-per-channel-daily',startHour:0,startMinute:0,intervalMinutes:60,tickWindowMinutes:8,recoveryMode:'catch-up-today',recoverySpacingMinutes:10,maxCatchUp:6,resumeInterrupted:true}
    },
    channels:[],jobs:[],logs:[],
    scheduler:{lastSlotKey:'',lastTickAt:null,lastRecoveryAt:null,slotHistory:[]},
    agentCommands:[],agents:{},analyticsCache:{}
  };
}
let state=null;
let writing=Promise.resolve();
async function readJson(file){return JSON.parse(await fsp.readFile(file,'utf8'))}

function mergeDefaults(raw={}){
  const base=defaultState();
  const rawSettings=raw.settings||{};
  return{
    ...base,...raw,version:6,
    settings:{
      ...base.settings,...rawSettings,
      factory:{...base.settings.factory,...(rawSettings.factory||{})},
      scheduler:{...base.settings.scheduler,...(rawSettings.scheduler||{})}
    },
    scheduler:{...base.scheduler,...(raw.scheduler||{}),slotHistory:Array.isArray(raw.scheduler?.slotHistory)?raw.scheduler.slotHistory.slice(-1500):[]},
    channels:Array.isArray(raw.channels)?raw.channels.map((c,i)=>({
      autoPublish:false,publishIntervalMinutes:1440,publishOrder:i,nextPublishAt:null,...c
    })):[],
    jobs:Array.isArray(raw.jobs)?raw.jobs.slice(-1000):[],
    logs:Array.isArray(raw.logs)?raw.logs.slice(-1500):[],
    agentCommands:Array.isArray(raw.agentCommands)?raw.agentCommands.slice(-1500):[],
    agents:raw.agents&&typeof raw.agents==='object'&&!Array.isArray(raw.agents)?raw.agents:{},
    analyticsCache:raw.analyticsCache&&typeof raw.analyticsCache==='object'&&!Array.isArray(raw.analyticsCache)?raw.analyticsCache:{}
  };
}
async function localFallback(){
  try{return mergeDefaults(await readJson(STATE_FILE));}
  catch(error){
    if(error.code!=='ENOENT')console.warn('state.json o‘qilmadi:',error.message);
    try{console.warn('Backup state tiklandi.');return mergeDefaults(await readJson(BACKUP_FILE));}catch{return defaultState()}
  }
}
async function r2Fallback(){
  if(!r2.configured())return null;
  try{const restored=await r2.restore();if(restored?.state){console.warn(`R2 recovery tiklandi${restored.at?`: ${restored.at}`:''}`);return mergeDefaults(restored.state)}}
  catch(error){console.warn('R2 recovery o‘qilmadi:',error.message)}
  return null;
}
async function load(){
  if(state)return state;
  await fsp.mkdir(DATA_DIR,{recursive:true});
  if(MONGODB_URI){
    try{
      const db=await ensureMongo();
      const doc=await stateCollection(db).findOne({_id:'main'});
      if(doc?.state){state=mergeDefaults(doc.state);lastDbError='';r2.backup(state).catch(()=>{});return state}
      state=await r2Fallback()||await localFallback();
      await save();
      await r2.backup(state,{force:true}).catch(()=>{});
      console.log('MongoDB yangi state bilan yaratildi.');
      return state;
    }catch(error){lastDbError=error.message;console.error('MongoDB state yuklanmadi:',error.message)}
  }
  state=await r2Fallback()||await localFallback();
  await save();
  return state;
}
async function writeLocalCopy(){
  try{
    await fsp.mkdir(DATA_DIR,{recursive:true});
    const tmp=`${STATE_FILE}.${process.pid}.tmp`;
    await fsp.writeFile(tmp,JSON.stringify(state,null,2),'utf8');
    await fsp.rename(tmp,STATE_FILE);
    try{await fsp.copyFile(STATE_FILE,BACKUP_FILE)}catch{}
  }catch(error){console.warn('Lokal state nusxasi yozilmadi:',error.message)}
}
async function save(){
  if(!state)state=defaultState();
  writing=writing.then(async()=>{
    let mongoSaved=false;
    if(MONGODB_URI){
      try{
        const db=await ensureMongo();
        await stateCollection(db).updateOne({_id:'main'},{$set:{state,updatedAt:new Date(),version:state.version||6}},{upsert:true});
        mongoSaved=true;lastDbError='';
      }catch(error){lastDbError=error.message;console.error('MongoDB state saqlanmadi:',error.message)}
    }
    await writeLocalCopy();
    const r2Result=await r2.backup(state).catch(error=>({ok:false,error:error.message}));
    if(MONGODB_URI&&!mongoSaved&&!r2Result?.ok)console.warn('State hozir faqat lokal fallback’da saqlandi.');
  });
  return writing;
}
async function forceRecoveryBackup(){if(!state)await load();return r2.backup(state,{force:true})}
async function getState(){return load()}

async function updateSettings(input={}){
  const s=await load();
  const current=s.settings;
  const schedInput=input.scheduler||{};
  const factoryInput=input.factory||{};
  const allowedAspect=['landscape','portrait','square'],allowedResolution=['720','1080'],allowedFit=['cover','contain'],allowedQuality=['fast','balanced','high'],allowedSongMode=['ordered','random'],allowedAi=['gemini','ollama','template'],allowedRecovery=['catch-up-today','next-only','skip-missed'];
  s.settings={
    ...current,
    clipDir:typeof input.clipDir==='string'?input.clipDir.trim():current.clipDir,
    musicDir:typeof input.musicDir==='string'?input.musicDir.trim():current.musicDir,
    outputDir:typeof input.outputDir==='string'?input.outputDir.trim():current.outputDir,
    thumbnailDir:typeof input.thumbnailDir==='string'?input.thumbnailDir.trim():current.thumbnailDir,
    clipSeconds:clamp(input.clipSeconds,1,30,current.clipSeconds),
    aspect:allowedAspect.includes(input.aspect)?input.aspect:current.aspect,
    resolution:allowedResolution.includes(String(input.resolution))?String(input.resolution):current.resolution,
    fit:allowedFit.includes(input.fit)?input.fit:current.fit,
    quality:allowedQuality.includes(input.quality)?input.quality:current.quality,
    parallelSegments:Math.round(clamp(input.parallelSegments,1,4,current.parallelSegments)),
    minFreeGb:clamp(input.minFreeGb,.5,200,current.minFreeGb),
    keepRendered:typeof input.keepRendered==='boolean'?input.keepRendered:current.keepRendered,
    songMode:allowedSongMode.includes(input.songMode)?input.songMode:current.songMode,
    timezone:typeof input.timezone==='string'&&input.timezone.trim()?input.timezone.trim():current.timezone,
    aiProvider:allowedAi.includes(input.aiProvider)?input.aiProvider:current.aiProvider,
    aiLanguage:typeof input.aiLanguage==='string'&&input.aiLanguage.trim()?input.aiLanguage.trim().slice(0,40):current.aiLanguage,
    factory:{
      ...current.factory,
      enabled:typeof factoryInput.enabled==='boolean'?factoryInput.enabled:current.factory.enabled,
      renderWorkers:Math.round(clamp(factoryInput.renderWorkers,1,3,current.factory.renderWorkers)),
      readyTarget:Math.round(clamp(factoryInput.readyTarget,1,100,current.factory.readyTarget)),
      maxReady:Math.round(clamp(factoryInput.maxReady,1,200,current.factory.maxReady)),
      pollSeconds:Math.round(clamp(factoryInput.pollSeconds,2,60,current.factory.pollSeconds)),
      consumeMode:['oldest','random'].includes(factoryInput.consumeMode)?factoryInput.consumeMode:current.factory.consumeMode
    },
    scheduler:{
      ...current.scheduler,
      enabled:typeof schedInput.enabled==='boolean'?schedInput.enabled:current.scheduler.enabled,
      mode:['once-per-channel-daily','continuous-hourly'].includes(schedInput.mode)?schedInput.mode:current.scheduler.mode,
      startHour:Math.round(clamp(schedInput.startHour,0,23,current.scheduler.startHour)),
      startMinute:Math.round(clamp(schedInput.startMinute,0,59,current.scheduler.startMinute)),
      intervalMinutes:Math.round(clamp(schedInput.intervalMinutes,15,1440,current.scheduler.intervalMinutes)),
      tickWindowMinutes:Math.round(clamp(schedInput.tickWindowMinutes,2,15,current.scheduler.tickWindowMinutes)),
      recoveryMode:allowedRecovery.includes(schedInput.recoveryMode)?schedInput.recoveryMode:current.scheduler.recoveryMode,
      recoverySpacingMinutes:Math.round(clamp(schedInput.recoverySpacingMinutes,1,180,current.scheduler.recoverySpacingMinutes)),
      maxCatchUp:Math.round(clamp(schedInput.maxCatchUp,1,24,current.scheduler.maxCatchUp)),
      resumeInterrupted:typeof schedInput.resumeInterrupted==='boolean'?schedInput.resumeInterrupted:current.scheduler.resumeInterrupted
    }
  };
  if(s.settings.factory.maxReady<s.settings.factory.readyTarget)s.settings.factory.maxReady=s.settings.factory.readyTarget;
  await save();
  return s.settings;
}
async function addLog(level,message,data=null){const s=await load();const entry={at:nowIso(),level,message,data};s.logs.push(entry);if(s.logs.length>1500)s.logs.splice(0,s.logs.length-1500);console.log(`[${entry.at}] [${level}] ${message}`);await save();return entry}

async function upsertChannel(channel){
  const s=await load();
  const index=s.channels.findIndex(c=>c.channelId===channel.channelId);
  const previous=index>=0?s.channels[index]:{};
  const tokenChanged=Boolean(channel.oauthEncrypted&&channel.oauthEncrypted!==previous.oauthEncrypted);
  const merged={
    enabled:true,order:index>=0?previous.order??index:s.channels.length,privacyStatus:previous.privacyStatus||'private',categoryId:previous.categoryId||'10',madeForKids:Boolean(previous.madeForKids),
    titleTemplate:previous.titleTemplate||'{song} | Official Music',descriptionTemplate:previous.descriptionTemplate||'{song}\n\n#music',tags:previous.tags||['music'],dailyMax:previous.dailyMax||1,
    autoPublish:previous.autoPublish??false,publishIntervalMinutes:previous.publishIntervalMinutes||1440,publishOrder:previous.publishOrder??(index>=0?index:s.channels.length),nextPublishAt:previous.nextPublishAt||null,
    lastUploadAt:previous.lastUploadAt||null,lastUploadDay:previous.lastUploadDay||'',uploadsToday:previous.uploadsToday||0,
    ...previous,...channel,updatedAt:nowIso()
  };
  if(index>=0)s.channels[index]=merged;else s.channels.push(merged);
  await save();if(tokenChanged)await forceRecoveryBackup().catch(()=>{});return merged;
}
async function patchChannel(channelId,patch={}){
  const s=await load();const channel=s.channels.find(c=>c.channelId===channelId);if(!channel)throw new Error('Kanal topilmadi');const clean={};
  if(typeof patch.enabled==='boolean')clean.enabled=patch.enabled;
  if(Number.isFinite(Number(patch.order)))clean.order=Math.max(0,Math.round(Number(patch.order)));
  if(['private','unlisted','public'].includes(patch.privacyStatus))clean.privacyStatus=patch.privacyStatus;
  if(typeof patch.categoryId==='string')clean.categoryId=patch.categoryId.slice(0,8);
  if(typeof patch.madeForKids==='boolean')clean.madeForKids=patch.madeForKids;
  if(typeof patch.titleTemplate==='string')clean.titleTemplate=patch.titleTemplate.slice(0,140);
  if(typeof patch.descriptionTemplate==='string')clean.descriptionTemplate=patch.descriptionTemplate.slice(0,4500);
  if(Array.isArray(patch.tags))clean.tags=patch.tags.map(x=>String(x).trim()).filter(Boolean).slice(0,30);
  if(Number.isFinite(Number(patch.dailyMax)))clean.dailyMax=Math.max(1,Math.min(24,Math.round(Number(patch.dailyMax))));
  if(typeof patch.autoPublish==='boolean')clean.autoPublish=patch.autoPublish;
  if(Number.isFinite(Number(patch.publishIntervalMinutes)))clean.publishIntervalMinutes=Math.max(5,Math.min(10080,Math.round(Number(patch.publishIntervalMinutes))));
  if(Number.isFinite(Number(patch.publishOrder)))clean.publishOrder=Math.max(0,Math.min(999,Math.round(Number(patch.publishOrder))));
  if(patch.nextPublishAt===null||typeof patch.nextPublishAt==='string')clean.nextPublishAt=patch.nextPublishAt||null;
  if(patch.autoPublish===true&&!channel.autoPublish&&!channel.nextPublishAt)clean.nextPublishAt=new Date().toISOString();
  Object.assign(channel,clean,{updatedAt:nowIso()});
  await save();return channel;
}
async function removeChannel(channelId){const s=await load();s.channels=s.channels.filter(c=>c.channelId!==channelId);await save();await forceRecoveryBackup().catch(()=>{})}
async function addJob(job){const s=await load();s.jobs.push(job);if(s.jobs.length>1000)s.jobs.splice(0,s.jobs.length-1000);await save();return job}
async function patchJob(jobId,patch){const s=await load();const job=s.jobs.find(j=>j.id===jobId);if(!job)throw new Error('Job topilmadi');Object.assign(job,patch,{updatedAt:nowIso()});await save();return job}
function recoverySubset(s){return{version:2,exportedAt:nowIso(),settings:s.settings,channels:s.channels,scheduler:s.scheduler,agentCommands:Array.isArray(s.agentCommands)?s.agentCommands.slice(-1500):[]}}
async function exportRecoveryState(){return recoverySubset(await load())}
async function importRecoveryState(input={},options={}){
  const s=await load();const incoming=mergeDefaults({settings:input.settings||{},channels:Array.isArray(input.channels)?input.channels:[],scheduler:input.scheduler||{},agentCommands:Array.isArray(input.agentCommands)?input.agentCommands:[]});let restored=0;
  for(const ch of incoming.channels.slice(0,100)){if(!ch||typeof ch.channelId!=='string'||!ch.channelId.trim())continue;const existing=s.channels.find(c=>c.channelId===ch.channelId);if(existing){const token=existing.oauthEncrypted||ch.oauthEncrypted;Object.assign(existing,ch,{oauthEncrypted:token,updatedAt:nowIso()})}else{s.channels.push({...ch,updatedAt:nowIso()})}restored++}
  if(options.restoreSettings!==false&&input.settings&&typeof input.settings==='object')s.settings={...s.settings,...input.settings,factory:{...s.settings.factory,...(input.settings.factory||{})},scheduler:{...s.settings.scheduler,...(input.settings.scheduler||{})}};
  if(input.scheduler&&typeof input.scheduler==='object')s.scheduler={...s.scheduler,...input.scheduler,slotHistory:Array.isArray(input.scheduler.slotHistory)?input.scheduler.slotHistory.slice(-1500):s.scheduler.slotHistory};
  if(Array.isArray(input.agentCommands)&&!s.agentCommands.length)s.agentCommands=input.agentCommands.slice(-1500);
  await save();await forceRecoveryBackup().catch(()=>{});return{restored,channels:s.channels.length};
}
async function getAnalyticsCache(key){const s=await load();return s.analyticsCache?.[key]||null}
async function setAnalyticsCache(key,value){const s=await load();s.analyticsCache=s.analyticsCache||{};s.analyticsCache[key]={at:Date.now(),value};const entries=Object.entries(s.analyticsCache);if(entries.length>100){entries.sort((a,b)=>(b[1]?.at||0)-(a[1]?.at||0));s.analyticsCache=Object.fromEntries(entries.slice(0,100))}await save();return value}
async function storageDiagnostics(){let dbOk=false;if(MONGODB_URI){try{const db=await ensureMongo();await db.command({ping:1});dbOk=true;lastDbError=''}catch(error){lastDbError=error.message}}const r2Status=await r2.diagnostics().catch(error=>({configured:r2.configured(),ok:false,lastError:error.message}));return{databaseConfigured:Boolean(MONGODB_URI),databaseOk:dbOk,mode:MONGODB_URI&&dbOk?'mongodb':r2Status?.ok?'r2-recovery':'file-fallback',databaseName:MONGODB_DB,lastDbError:lastDbError||'',r2:r2Status}}
async function closeStorage(){try{await mongoClient?.close()}catch{}mongoClient=null;mongoDb=null;mongoReady=null}
module.exports={getState,save,updateSettings,addLog,upsertChannel,patchChannel,removeChannel,addJob,patchJob,exportRecoveryState,importRecoveryState,getAnalyticsCache,setAnalyticsCache,forceRecoveryBackup,storageDiagnostics,closeStorage,DATA_DIR,STATE_FILE,BACKUP_FILE};
