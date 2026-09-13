const { google } = require('googleapis');
const { authorized } = require('./youtube');

const cache = new Map();
const TTL_MS = 90 * 1000;

function isoDate(date) {
  return new Date(date).toISOString().slice(0, 10);
}
function daysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}
function sum(rows, key) {
  return rows.reduce((a, r) => a + Number(r[key] || 0), 0);
}
function weightedAverage(rows, key, weight='views') {
  const w = sum(rows, weight);
  if (!w) return 0;
  return rows.reduce((a, r) => a + Number(r[key] || 0) * Number(r[weight] || 0), 0) / w;
}
function pct(a, b) { return b ? (a / b) * 100 : 0; }
function trend(current, previous) {
  if (!previous) return current ? 100 : 0;
  return ((current - previous) / previous) * 100;
}
function round(n, digits=1) {
  const p = 10 ** digits;
  return Math.round((Number(n || 0) + Number.EPSILON) * p) / p;
}

function recommendationPack(summary, recent7, previous7) {
  const recs = [];
  const strengths = [];
  const viewTrend = trend(recent7.views, previous7.views);
  const likeRate = pct(summary.likes, summary.views);
  const commentRate = pct(summary.comments, summary.views);
  const subConversion = pct(summary.netSubscribers, summary.views);
  const retention = summary.averageViewPercentage;

  if (viewTrend <= -20) recs.push({ level:'high', title:'Ko‘rishlar pasaymoqda', text:`Oxirgi 7 kun oldingi 7 kunga nisbatan ${Math.abs(round(viewTrend))}% past. Kuchli mavzu/thumbnail va upload vaqtlarini qayta sinab ko‘ring.` });
  else if (viewTrend >= 20) strengths.push(`Ko‘rishlar oxirgi 7 kunda ${round(viewTrend)}% o‘sdi.`);

  if (retention && retention < 35) recs.push({ level:'high', title:'Retention past', text:`O‘rtacha ko‘rish foizi ${round(retention)}%. Videoning birinchi 15–30 soniyasini kuchaytirish va ortiqcha intro qisqartirish foydali.` });
  else if (retention >= 45) strengths.push(`Retention yaxshi: ${round(retention)}%.`);

  if (summary.views >= 100 && likeRate < 1.5) recs.push({ level:'medium', title:'Like engagement past', text:`Like/view nisbati ${round(likeRate,2)}%. Video va tavsifda tabiiy CTA hamda auditoriyaga mosroq mavzu sinab ko‘ring.` });
  else if (likeRate >= 3) strengths.push(`Like engagement kuchli: ${round(likeRate,2)}%.`);

  if (summary.views >= 500 && subConversion < 0.08) recs.push({ level:'medium', title:'Obunachiga aylanish past', text:`Net obunachi konversiyasi ${round(subConversion,3)}%. Kanal pozitsiyasi, seriyalar va videodan-videoga yo‘naltirishni kuchaytiring.` });
  else if (subConversion >= 0.25) strengths.push(`Obunachi konversiyasi yaxshi: ${round(subConversion,3)}%.`);

  if (summary.views >= 100 && commentRate < 0.05) recs.push({ level:'low', title:'Izoh faolligi past', text:'Kommentga undaydigan savol yoki aniq mavzuli CTA qo‘shish mumkin.' });

  if (!recs.length) recs.push({ level:'info', title:'Keskin muammo topilmadi', text:'Hozirgi trend barqaror. Eng yaxshi natija bergan formatlarni takroriy test qiling.' });
  return { recs, strengths, viewTrend: round(viewTrend) };
}

async function channelAnalytics(channelId, days=28, force=false) {
  const safeDays = Math.max(7, Math.min(90, Number(days) || 28));
  const key = `${channelId}:${safeDays}`;
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const { channel, auth, youtube } = await authorized(channelId);
  const analytics = google.youtubeAnalytics({ version:'v2', auth });
  const endDate = isoDate(daysAgo(1));
  const startDate = isoDate(daysAgo(safeDays));
  const metrics = 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,comments,shares,subscribersGained,subscribersLost';

  const report = await analytics.reports.query({
    ids:'channel==MINE', startDate, endDate, dimensions:'day', metrics, sort:'day'
  });
  const headers = (report.data.columnHeaders || []).map(h => h.name);
  const rows = (report.data.rows || []).map(row => Object.fromEntries(headers.map((h, i) => [h, row[i]])));

  const live = await youtube.channels.list({ part:['snippet','statistics'], mine:true });
  const liveItem = live.data.items?.[0];
  const midpoint = Math.max(0, rows.length - 14);
  const recentRows = rows.slice(-7);
  const previousRows = rows.slice(midpoint, Math.max(midpoint, rows.length - 7));
  const summarize = part => ({
    views: sum(part,'views'),
    watchMinutes: sum(part,'estimatedMinutesWatched'),
    likes: sum(part,'likes'), comments: sum(part,'comments'), shares: sum(part,'shares'),
    gained: sum(part,'subscribersGained'), lost: sum(part,'subscribersLost')
  });
  const recent7 = summarize(recentRows);
  const previous7 = summarize(previousRows);
  const summary = {
    views: sum(rows,'views'),
    watchHours: round(sum(rows,'estimatedMinutesWatched') / 60, 1),
    averageViewDuration: round(weightedAverage(rows,'averageViewDuration'), 1),
    averageViewPercentage: round(weightedAverage(rows,'averageViewPercentage'), 1),
    likes: sum(rows,'likes'), comments: sum(rows,'comments'), shares: sum(rows,'shares'),
    subscribersGained: sum(rows,'subscribersGained'), subscribersLost: sum(rows,'subscribersLost')
  };
  summary.netSubscribers = summary.subscribersGained - summary.subscribersLost;
  summary.likeRate = round(pct(summary.likes, summary.views), 2);
  summary.subConversion = round(pct(summary.netSubscribers, summary.views), 3);
  summary.currentSubscribers = Number(liveItem?.statistics?.subscriberCount || channel.subscribers || 0);
  summary.currentTotalViews = Number(liveItem?.statistics?.viewCount || channel.views || 0);
  summary.currentVideoCount = Number(liveItem?.statistics?.videoCount || channel.videoCount || 0);
  const advice = recommendationPack(summary, recent7, previous7);

  const value = {
    channelId,
    title: liveItem?.snippet?.title || channel.title,
    thumbnail: liveItem?.snippet?.thumbnails?.default?.url || channel.thumbnail || '',
    range:{ startDate, endDate, days:safeDays },
    summary,
    recent7, previous7,
    viewTrend: advice.viewTrend,
    recommendations: advice.recs,
    strengths: advice.strengths,
    daily: rows.map(r => ({
      day:r.day,
      views:Number(r.views||0),
      watchMinutes:Number(r.estimatedMinutesWatched||0),
      avgDuration:Number(r.averageViewDuration||0),
      avgPercent:Number(r.averageViewPercentage||0),
      likes:Number(r.likes||0), comments:Number(r.comments||0), shares:Number(r.shares||0),
      gained:Number(r.subscribersGained||0), lost:Number(r.subscribersLost||0)
    })),
    fetchedAt:new Date().toISOString()
  };
  cache.set(key,{ at:Date.now(), value });
  return value;
}

async function allAnalytics(channels, days=28, force=false) {
  const results=[];
  for (const ch of channels) {
    if (!ch.oauthEncrypted) continue;
    try { results.push(await channelAnalytics(ch.channelId, days, force)); }
    catch (error) { results.push({ channelId:ch.channelId, title:ch.title, error:error.message, fetchedAt:new Date().toISOString() }); }
  }
  const ok = results.filter(x => !x.error);
  const ranked = [...ok].sort((a,b)=>b.summary.views-a.summary.views).map((x,i)=>({ channelId:x.channelId, rank:i+1 }));
  return { results, ranked, fetchedAt:new Date().toISOString() };
}

module.exports = { channelAnalytics, allAnalytics };
