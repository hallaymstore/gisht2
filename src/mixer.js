const fs=require('fs');const fsp=fs.promises;const path=require('path');const os=require('os');
const{VIDEO_EXTENSIONS,AUDIO_EXTENSIONS,scanFiles,probeMedia,renderSegment,muxSegments,availableBytes}=require('./media');
const{shuffle,safeName,stripExtension,id}=require('./utils');

async function mapLimit(items,limit,worker,signal){let cursor=0;const count=Math.max(1,Math.min(limit,items.length||1));await Promise.all(Array.from({length:count},async()=>{while(cursor<items.length){if(signal?.aborted)throw signal.reason||new Error('Jarayon to‘xtatildi');const index=cursor++;await worker(items[index],index);}}));}

async function selectSong(settings,state,signal){const songs=await scanFiles(settings.musicDir,AUDIO_EXTENSIONS);if(signal?.aborted)throw signal.reason||new Error('Jarayon to‘xtatildi');if(!songs.length)throw new Error('Musiqa papkasida mos audio fayl topilmadi');if(settings.songMode==='random')return{song:shuffle(songs)[0],songs};const index=Math.max(0,Number(state.settings.nextSongIndex||0))%songs.length;return{song:songs[index],songs,index};}

function nextBatch(clips,previous){let batch=shuffle(clips);if(previous&&batch.length>1&&batch[0]===previous){const i=batch.findIndex(x=>x!==previous);if(i>0)[batch[0],batch[i]]=[batch[i],batch[0]];}return batch;}

async function buildDurationPlan({clips,targetDuration,segmentsDir,signal,trackChild,onProbe=()=>{}}){
  const probeCache=new Map();const plan=[];let remaining=targetDuration;let previous=null;let batch=[];let guard=0;let bad=0;
  while(remaining>.04){
    if(signal?.aborted)throw signal.reason||new Error('Jarayon to‘xtatildi');
    if(!batch.length)batch=nextBatch(clips,previous);
    const source=batch.shift();guard++;if(guard>Math.max(10000,clips.length*2000))throw new Error('Video ketma-ketligini tuzib bo‘lmadi');
    let info=probeCache.get(source);
    if(!info){try{info=await probeMedia(source,signal,trackChild);probeCache.set(source,info);onProbe(probeCache.size,clips.length);}catch{bad++;if(bad>=clips.length*3)throw new Error('Video bo‘laklarning davomiyligini aniqlab bo‘lmadi');continue;}}
    if(!info.hasVideo||!Number.isFinite(info.duration)||info.duration<=.08){bad++;if(bad>=clips.length*3)throw new Error('Yaroqli video bo‘lak topilmadi');continue;}
    const seconds=Math.min(info.duration,remaining);
    if(seconds<=.04)break;
    const index=plan.length;
    plan.push({source,destination:path.join(segmentsDir,`${String(index).padStart(5,'0')}.ts`),startAt:0,seconds,sourceDuration:info.duration});
    remaining=Math.max(0,remaining-seconds);previous=source;
  }
  if(!plan.length)throw new Error('Video reja tuzilmadi');
  return plan;
}

async function renderOne({settings,state,onProgress=()=>{},log=()=>{},signal,trackChild}){
  if(!settings.clipDir||!settings.musicDir)throw new Error('Clip va musiqa papkalarini sozlang');
  if(signal?.aborted)throw signal.reason||new Error('Jarayon to‘xtatildi');
  await fsp.mkdir(settings.outputDir,{recursive:true});
  const free=await availableBytes(settings.outputDir);if(free<settings.minFreeGb*1024**3)throw new Error(`Diskda ${settings.minFreeGb} GB dan kam bo‘sh joy qoldi`);
  const[clips,selected]=await Promise.all([scanFiles(settings.clipDir,VIDEO_EXTENSIONS),selectSong(settings,state,signal)]);
  if(!clips.length)throw new Error('Video bo‘laklar papkasida mos video topilmadi');
  const song=selected.song;const audioInfo=await probeMedia(song,signal,trackChild);if(!audioInfo.duration||audioInfo.duration<1)throw new Error('Musiqa davomiyligi aniqlanmadi');
  const workDir=await fsp.mkdtemp(path.join(os.tmpdir(),'automix-youtube-'));const segmentsDir=path.join(workDir,'segments');await fsp.mkdir(segmentsDir,{recursive:true});
  try{
    onProgress(1,'plan');
    const plan=await buildDurationPlan({clips,targetDuration:audioInfo.duration,segmentsDir,signal,trackChild,onProbe:(done,total)=>onProgress(Math.min(8,1+Math.round(done/Math.max(1,total)*7)),'probe')});
    const count=plan.length;const plannedSeconds=plan.reduce((n,x)=>n+x.seconds,0);
    log(`${path.basename(song)}: ${count} ta turli uzunlikdagi klip, ${plannedSeconds.toFixed(2)} s → musiqa ${audioInfo.duration.toFixed(2)} s`);
    let finished=0;
    await mapLimit(plan,settings.parallelSegments||2,async item=>{await renderSegment({...item,config:settings,signal,trackChild});finished++;onProgress(8+Math.round((finished/count)*67),'render');},signal);
    const listFile=path.join(workDir,'segments.txt');const list=plan.map(item=>`file '${item.destination.replace(/'/g,"'\\''")}'`).join('\n');await fsp.writeFile(listFile,list,'utf8');
    const outputName=`${safeName(stripExtension(song))}_${new Date().toISOString().replace(/[:.]/g,'-')}_${id('mix').slice(-8)}.mp4`;const outputFile=path.join(settings.outputDir,outputName);
    await muxSegments({listFile,audioFile:song,outputFile,duration:audioInfo.duration,signal,trackChild,onProgress:p=>onProgress(75+Math.round(p*25),'mux')});
    onProgress(100,'done');
    return{outputFile,songFile:song,songName:stripExtension(song),duration:audioInfo.duration,clipCount:count,sourceClips:plan.map(x=>({name:path.basename(x.source),sourceDuration:x.sourceDuration,usedSeconds:x.seconds,startAt:0}))};
  }finally{await fsp.rm(workDir,{recursive:true,force:true}).catch(()=>{});}
}

module.exports={renderOne,selectSong,buildDurationPlan};
