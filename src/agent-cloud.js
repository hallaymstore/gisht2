const crypto=require('crypto');
const{getState,save,addLog}=require('./store');
const{id,nowIso,localDateTimeKey,dateKey}=require('./utils');

function ensure(s){
  if(!Array.isArray(s.agentCommands))s.agentCommands=[];
  if(!s.agents||typeof s.agents!=='object'||Array.isArray(s.agents))s.agents={};
  if(s.agentCommands.length>1500)s.agentCommands=s.agentCommands.slice(-1500);
  return s;
}
function configured(){return Boolean(process.env.AGENT_KEY)}
function safeEqual(a,b){const aa=Buffer.from(String(a||'')),bb=Buffer.from(String(b||''));return aa.length===bb.length&&aa.length>0&&crypto.timingSafeEqual(aa,bb)}
function verify(req,res,next){if(!configured())return res.status(503).json({error:'AGENT_KEY sozlanmagan'});if(!safeEqual(req.get('x-agent-key'),process.env.AGENT_KEY))return res.status(401).json({error:'AGENT_AUTH_FAILED'});next()}

async function snapshot(){const s=ensure(await getState());return{agents:Object.values(s.agents).sort((a,b)=>String(b.lastSeenAt||'').localeCompare(String(a.lastSeenAt||''))),commands:[...s.agentCommands].slice(-350).reverse()}}

async function heartbeat(body={}){
  const s=ensure(await getState());
  const deviceId=String(body.deviceId||'').trim().slice(0,120);if(!deviceId)throw new Error('deviceId kerak');
  const old=s.agents[deviceId]||{};
  s.agents[deviceId]={
    ...old,deviceId,
    name:String(body.name||old.name||deviceId).slice(0,120),platform:String(body.platform||old.platform||'').slice(0,120),appVersion:String(body.appVersion||old.appVersion||'').slice(0,40),
    status:String(body.status||'online').slice(0,60),currentCommandId:body.currentCommandId||null,
    clips:Number(body.clips||0),songs:Number(body.songs||0),freeGb:Number(body.freeGb||0),
    readyCount:Number(body.readyCount??old.readyCount??0),renderingCount:Number(body.renderingCount??old.renderingCount??0),factoryEnabled:Boolean(body.factoryEnabled??old.factoryEnabled),
    clipDir:String(body.clipDir||old.clipDir||'').slice(0,500),musicDir:String(body.musicDir||old.musicDir||'').slice(0,500),outputDir:String(body.outputDir||old.outputDir||'').slice(0,500),thumbnailDir:String(body.thumbnailDir||old.thumbnailDir||'').slice(0,500),readyDir:String(body.readyDir||old.readyDir||'').slice(0,500),
    lastError:String(body.lastError||'').slice(0,700),lastSeenAt:nowIso()
  };
  await save();return s.agents[deviceId];
}

function activeForChannel(s,channelId){return s.agentCommands.find(x=>x.channelId===channelId&&['queued','scheduled','claimed','rendering','metadata','uploading','cancel_requested'].includes(x.status))}
function makeCommand(ch,{scheduledLocal='',type='render-upload',source='panel'}={}){
  const when=String(scheduledLocal||'').trim();
  return{id:id('cmd'),type,source,channelId:ch.channelId,channelTitle:ch.title,status:when?'scheduled':'queued',scheduledLocal:when,progress:0,stage:when?`Reja: ${when}`:type==='upload-ready'?'Tayyor video navbatida':'Qurilma navbatida',createdAt:nowIso(),updatedAt:nowIso(),claimedBy:null,claimedAt:null,completedAt:null,error:'',youtubeId:'',youtubeUrl:'',songName:''};
}
async function createCommand({channelId,scheduledLocal='',type='render-upload',source='panel'}={}){
  const s=ensure(await getState());const ch=s.channels.find(c=>c.channelId===channelId);if(!ch)throw new Error('Kanal topilmadi');
  const when=String(scheduledLocal||'').trim();if(when&&!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(when))throw new Error('scheduledLocal formati noto‘g‘ri');
  const active=activeForChannel(s,channelId);if(active&&!when)return active;
  const cmd=makeCommand(ch,{scheduledLocal:when,type,source});s.agentCommands.push(cmd);await save();await addLog('info',`Local Agent buyrug‘i: ${ch.title}${when?` — ${when}`:''}${type==='upload-ready'?' • ready pool':''}`);return cmd;
}

function seedAutoPublish(s){
  const now=Date.now();
  const enabled=(s.channels||[]).filter(c=>c.enabled!==false&&c.autoPublish).sort((a,b)=>(a.publishOrder??a.order??0)-(b.publishOrder??b.order??0));
  let changed=false;
  for(const ch of enabled){
    if(activeForChannel(s,ch.channelId))continue;
    const dueAt=Date.parse(ch.nextPublishAt||ch.lastUploadAt||0);
    if(ch.nextPublishAt==null&&!ch.lastUploadAt){ch.nextPublishAt=new Date(now).toISOString();changed=true;}
    const effective=Date.parse(ch.nextPublishAt||0);
    if(Number.isFinite(effective)&&effective<=now){
      s.agentCommands.push(makeCommand(ch,{type:'upload-ready',source:'auto-publish'}));
      ch.nextPublishAt=null;
      ch.updatedAt=nowIso();changed=true;
    }
  }
  return changed;
}

async function claim(deviceId){
  const s=ensure(await getState());
  const nowLocal=localDateTimeKey(new Date(),s.settings.timezone||'Asia/Samarkand');
  let changed=seedAutoPublish(s);
  for(const cmd of s.agentCommands){if(cmd.status==='scheduled'&&cmd.scheduledLocal&&cmd.scheduledLocal<=nowLocal){cmd.status='queued';cmd.stage='Reja vaqti keldi';cmd.updatedAt=nowIso();changed=true;}}
  const cmd=s.agentCommands.find(x=>x.status==='queued');
  if(!cmd){if(changed)await save();return null;}
  cmd.status='claimed';cmd.claimedBy=deviceId;cmd.claimedAt=nowIso();cmd.updatedAt=nowIso();cmd.stage=cmd.type==='upload-ready'?'Tayyor videoni olish':'Qurilma qabul qildi';
  await save();return cmd;
}

async function commandState(commandId){const s=ensure(await getState());const cmd=s.agentCommands.find(x=>x.id===commandId);if(!cmd)throw new Error('Buyruq topilmadi');return{id:cmd.id,status:cmd.status,stage:cmd.stage,updatedAt:cmd.updatedAt}}

async function report(commandId,body={}){
  const s=ensure(await getState());const cmd=s.agentCommands.find(x=>x.id===commandId);if(!cmd)throw new Error('Buyruq topilmadi');
  const wasDone=cmd.status==='done';const allowed=['claimed','rendering','metadata','uploading','waiting_ready','done','failed','cancelled','cancel_requested'];const requestedStop=cmd.status==='cancel_requested';
  if(allowed.includes(body.status)){const terminal=['done','failed','cancelled'].includes(body.status);if(!requestedStop||terminal)cmd.status=body.status;}
  if(body.stage!=null&&!requestedStop)cmd.stage=String(body.stage).slice(0,240);
  if(body.progress!=null)cmd.progress=Math.max(0,Math.min(100,Number(body.progress)||0));
  if(body.songName!=null)cmd.songName=String(body.songName).slice(0,240);
  if(body.error!=null)cmd.error=String(body.error).slice(0,1000);
  if(body.youtubeId!=null)cmd.youtubeId=String(body.youtubeId).slice(0,64);
  if(body.youtubeUrl!=null)cmd.youtubeUrl=String(body.youtubeUrl).slice(0,500);
  cmd.updatedAt=nowIso();if(['done','failed','cancelled'].includes(cmd.status))cmd.completedAt=nowIso();
  if(cmd.status==='done'&&!wasDone){
    const ch=s.channels.find(c=>c.channelId===cmd.channelId);
    if(ch){
      const now=new Date();const today=dateKey(now,s.settings.timezone||'Asia/Samarkand');
      ch.lastUploadAt=now.toISOString();
      const interval=Math.max(5,Number(ch.publishIntervalMinutes||1440));
      ch.nextPublishAt=ch.autoPublish?new Date(now.getTime()+interval*60000).toISOString():null;
      if(ch.lastUploadDay===today)ch.uploadsToday=Number(ch.uploadsToday||0)+1;else{ch.lastUploadDay=today;ch.uploadsToday=1;}
      ch.updatedAt=nowIso();
    }
  }
  await save();
  if(cmd.status==='done'&&!wasDone)await addLog('success',`${cmd.channelTitle}: upload tugadi — ${cmd.youtubeUrl||cmd.youtubeId}`);
  if(cmd.status==='failed')await addLog('error',`${cmd.channelTitle}: Local Agent xato — ${cmd.error||cmd.stage}`);
  if(cmd.status==='cancelled')await addLog('warning',`${cmd.channelTitle}: ish to‘xtatildi`);
  return cmd;
}

async function cancel(commandId){
  const s=ensure(await getState());const cmd=s.agentCommands.find(x=>x.id===commandId);if(!cmd)throw new Error('Buyruq topilmadi');
  if(['queued','scheduled','waiting_ready'].includes(cmd.status)){cmd.status='cancelled';cmd.stage='Bekor qilindi';cmd.updatedAt=nowIso();cmd.completedAt=nowIso();await save();return cmd;}
  if(['claimed','rendering','metadata','uploading'].includes(cmd.status)){cmd.status='cancel_requested';cmd.stage='To‘xtatish so‘rovi yuborildi';cmd.updatedAt=nowIso();await save();return cmd;}
  if(cmd.status==='cancel_requested')return cmd;
  throw new Error('Bu ish allaqachon yakunlangan');
}
module.exports={verify,configured,snapshot,heartbeat,createCommand,claim,commandState,report,cancel};
