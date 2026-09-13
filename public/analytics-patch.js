/* Structured YouTube Analytics fallback UI. */
(function(){
  const originalRenderAnalytics=renderAnalytics;
  renderAnalytics=function(){
    const list=analyticsData?.results||[];
    const hasPartial=list.some(a=>a.partial||a.errorCode);
    if(!hasPartial)return originalRenderAnalytics();
    $('#analyticsCards').innerHTML=list.map(a=>{
      if(!a.partial&&!a.error)return renderOk(a);
      const s=a.summary||{};
      const code=a.errorCode||'OTHER';
      let title='Analytics vaqtincha cheklangan',hint=a.error||'Analytics ma’lumoti olinmadi',actions='';
      if(code==='API_DISABLED'){title='YouTube Analytics API yoqilmagan';hint='Google Cloud’da YouTube Analytics API’ni bir marta yoqing. Public kanal statistikasi ishlashda davom etadi.';const project='627287067665';actions=`<a class="button" target="_blank" rel="noreferrer" href="https://console.cloud.google.com/apis/library/youtubeanalytics.googleapis.com?project=${project}">Analytics API’ni yoqish</a>`;}
      else if(code==='SCOPE_MISSING'){title='Analytics ruxsati yetarli emas';hint='Faqat shu kanalni bir marta Analytics scope bilan qayta ulang.';actions='<a class="button" href="/auth/google">Qayta ulash</a>';}
      else if(code==='TOKEN_REVOKED'){title='Google ruxsati bekor qilingan';hint='Google token bekor qilingan. Faqat shu kanalni qayta ulang.';actions='<a class="button" href="/auth/google">Qayta ulash</a>';}
      else if(code==='NOT_CONNECTED'){title='Kanal ulanmagan';actions='<a class="button" href="/auth/google">Kanal ulash</a>';}
      else if(code==='QUOTA'){title='API kvotasi vaqtincha tugagan';hint='Kanalni qayta ulash shart emas. Kvota tiklangach avtomatik davom etadi.';}
      return `<article class="analytics-card"><h3>${esc(a.title||'Kanal')}</h3><div class="recommend ${code==='QUOTA'?'medium':'high'}"><b>${esc(title)}</b><br>${esc(hint)}</div><div class="kpis"><div class="kpi"><b>${num(s.currentSubscribers||0)}</b><small>Current sub</small></div><div class="kpi"><b>${num(s.currentTotalViews||0)}</b><small>Total views</small></div><div class="kpi"><b>${num(s.currentVideoCount||0)}</b><small>Videolar</small></div></div>${(a.recommendations||[]).map(r=>`<div class="recommend ${r.level}"><b>${esc(r.title)}</b><br>${esc(r.text)}</div>`).join('')}<div class="row">${actions}</div></article>`;
    }).join('')||'<article class="card">Analytics yo‘q.</article>';
    renderCompare();
  };
  function renderOk(a){const s=a.summary,max=Math.max(1,...(a.daily||[]).map(d=>d.views));return `<article class="analytics-card"><div class="head"><div><h3>${esc(a.title)}</h3><small>${esc(a.range?.startDate||'')} → ${esc(a.range?.endDate||'')}</small></div><b class="trend ${a.viewTrend>=0?'up':'down'}">${a.viewTrend>=0?'+':''}${a.viewTrend||0}%</b></div><div class="kpis"><div class="kpi"><b>${num(s.views)}</b><small>Views</small></div><div class="kpi"><b>${num(s.watchHours)}h</b><small>Watch time</small></div><div class="kpi"><b>${s.averageViewPercentage||0}%</b><small>Retention</small></div><div class="kpi"><b>${s.netSubscribers>=0?'+':''}${num(s.netSubscribers)}</b><small>Net sub</small></div><div class="kpi"><b>${s.likeRate||0}%</b><small>Like rate</small></div><div class="kpi"><b>${num(s.currentSubscribers)}</b><small>Current sub</small></div></div><div class="spark">${(a.daily||[]).map(d=>`<i title="${d.day}: ${d.views}" style="height:${Math.max(3,Math.round(d.views/max*100))}%"></i>`).join('')}</div>${(a.recommendations||[]).map(r=>`<div class="recommend ${r.level}"><b>${esc(r.title)}</b><br>${esc(r.text)}</div>`).join('')}</article>`;}
})();
