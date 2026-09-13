/* Friendly fallback when YouTube Analytics API is disabled in Google Cloud. */
(function(){
  const originalRenderAnalytics = renderAnalytics;
  renderAnalytics = function(){
    const list = analyticsData?.results || [];
    const disabledRx = /YouTube Analytics API has not been used|youtubeanalytics\.googleapis\.com|accessNotConfigured|SERVICE_DISABLED/i;
    const hasDisabled = list.some(a => a.error && disabledRx.test(a.error));
    if (!hasDisabled) return originalRenderAnalytics();

    $('#analyticsCards').innerHTML = list.map(a => {
      if (!a.error) {
        const s=a.summary,max=Math.max(1,...a.daily.map(d=>d.views));
        return `<article class="analytics-card"><div class="head"><div><h3>${esc(a.title)}</h3><small>${esc(a.range.startDate)} → ${esc(a.range.endDate)}</small></div><b class="trend ${a.viewTrend>=0?'up':'down'}">${a.viewTrend>=0?'+':''}${a.viewTrend}%</b></div><div class="kpis"><div class="kpi"><b>${num(s.views)}</b><small>Views</small></div><div class="kpi"><b>${num(s.watchHours)}h</b><small>Watch time</small></div><div class="kpi"><b>${s.averageViewPercentage}%</b><small>Retention</small></div><div class="kpi"><b>${s.netSubscribers>=0?'+':''}${num(s.netSubscribers)}</b><small>Net sub</small></div><div class="kpi"><b>${s.likeRate}%</b><small>Like rate</small></div><div class="kpi"><b>${num(s.currentSubscribers)}</b><small>Current sub</small></div></div><div class="spark">${a.daily.map(d=>`<i title="${d.day}: ${d.views}" style="height:${Math.max(3,Math.round(d.views/max*100))}%"></i>`).join('')}</div>${(a.recommendations||[]).map(r=>`<div class="recommend ${r.level}"><b>${esc(r.title)}</b><br>${esc(r.text)}</div>`).join('')}</article>`;
      }
      const ch=(snapshot?.channels||[]).find(c=>c.channelId===a.channelId)||{};
      if (!disabledRx.test(a.error)) return `<article class="analytics-card"><h3>${esc(a.title)}</h3><p class="trend down">${esc(a.error)}</p><a class="button" href="/auth/google">Qayta ulash</a></article>`;
      const project=(String(a.error).match(/project(?:=|\s)(\d{6,})/i)||[])[1]||'627287067665';
      const enableUrl=`https://console.cloud.google.com/apis/library/youtubeanalytics.googleapis.com?project=${encodeURIComponent(project)}`;
      return `<article class="analytics-card"><h3>${esc(a.title)}</h3><div class="recommend high"><b>YouTube Analytics API yoqilmagan</b><br>OAuth kanalga ulangan, lekin Google Cloud project ${esc(project)} ichida Analytics API hali o‘chiq.</div><div class="kpis"><div class="kpi"><b>${num(ch.subscribers)}</b><small>Current sub</small></div><div class="kpi"><b>${num(ch.views)}</b><small>Total views</small></div><div class="kpi"><b>${num(ch.videoCount)}</b><small>Videolar</small></div></div><p class="hint">API'ni bir marta yoqing. 1–5 daqiqa kutib “Analytics yangilash”ni bosing. Analytics scope allaqachon berilgan bo‘lsa, kanalni qayta ulash shart emas.</p><a class="button" target="_blank" rel="noreferrer" href="${enableUrl}">YouTube Analytics API’ni yoqish</a>${ch.analyticsScope?' <span class="trend up">OAuth Analytics ruxsati bor</span>':' <a class="button ghost" href="/auth/google">Kanalni qayta ulash</a>'}</article>`;
    }).join('') || '<article class="card">Analytics yo‘q.</article>';
    renderCompare();
  };
})();
