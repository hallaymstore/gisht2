const { stripExtension } = require('./utils');

function templateMetadata({ songName, channel, settings }) {
  const cleanSong = stripExtension(songName || 'Music');
  const title = String(channel.titleTemplate || '{song} | Official Music').replaceAll('{song}', cleanSong).slice(0, 100);
  const description = String(channel.descriptionTemplate || '{song}\n\n#music')
    .replaceAll('{song}', cleanSong)
    .replaceAll('{channel}', channel.title || '')
    .slice(0, 4900);
  return { title, description, tags: Array.isArray(channel.tags) && channel.tags.length ? channel.tags.slice(0, 30) : ['music'], source: 'template' };
}
function parseJsonText(text) { const cleaned = String(text || '').trim().replace(/^```json\s*/i, '').replace(/\s*```$/, ''); return JSON.parse(cleaned); }
function normalizeMetadata(data, fallback) { return { title: String(data.title || fallback.title).replace(/\s+/g, ' ').trim().slice(0, 100), description: String(data.description || fallback.description).trim().slice(0, 4900), tags: Array.isArray(data.tags) ? data.tags.map(x => String(x).trim()).filter(Boolean).slice(0, 30) : fallback.tags, source: data.source || fallback.source }; }
function prompt({ songName, channel, settings }) { return `Create YouTube metadata for a music video.\nLanguage: ${settings.aiLanguage || 'English'}\nSong/file name: ${songName}\nChannel: ${channel.title || ''}\nChannel tags: ${(channel.tags || []).join(', ')}\nReturn strict JSON with keys: title, description, tags.\nRules: title <= 100 characters; description natural and not spammy; tags array <= 20 items; do not invent artist facts not present in the song/file name; avoid misleading claims; do not include copyrighted lyrics.`; }
async function geminiMetadata(input) {
  const key = process.env.GEMINI_API_KEY; if (!key) throw new Error('GEMINI_API_KEY kiritilmagan');
  const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const response = await fetch(url, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ contents:[{role:'user',parts:[{text:prompt(input)}]}], generationConfig:{temperature:.65,responseMimeType:'application/json',maxOutputTokens:1000} }), signal:AbortSignal.timeout(45000) });
  const body = await response.json().catch(()=>({})); if (!response.ok) throw new Error(body.error?.message || `Gemini HTTP ${response.status}`);
  const text = body.candidates?.[0]?.content?.parts?.map(x=>x.text||'').join('') || ''; const parsed = parseJsonText(text); parsed.source=`gemini:${model}`; return parsed;
}
async function ollamaMetadata(input) {
  const url = `${(process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '')}/api/chat`; const model=process.env.OLLAMA_MODEL||'qwen2.5:1.5b';
  const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model,stream:false,format:'json',messages:[{role:'user',content:prompt(input)}],options:{temperature:.65}}),signal:AbortSignal.timeout(120000)});
  const body=await response.json().catch(()=>({})); if(!response.ok) throw new Error(body.error||`Ollama HTTP ${response.status}`); const parsed=parseJsonText(body.message?.content||'{}'); parsed.source=`ollama:${model}`; return parsed;
}
async function generateMetadata(input) {
  const fallback=templateMetadata(input); const provider=input.settings.aiProvider||process.env.AI_PROVIDER||'template';
  try { const raw=provider==='gemini'?await geminiMetadata(input):provider==='ollama'?await ollamaMetadata(input):fallback; return normalizeMetadata(raw,fallback); }
  catch(error){ return {...fallback,source:`template-fallback (${error.message})`,warning:error.message}; }
}
module.exports={generateMetadata,templateMetadata,geminiMetadata,ollamaMetadata};
