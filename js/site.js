// VoB TV 메인 화면
// 미리보기(Artifact)에서는 외부 영상 삽입이 막혀 있어 VOB_PREVIEW=true 로 안내 문구를 보여줍니다.
const PREVIEW = window.VOB_PREVIEW === true;
const BANNER_IMG = "assets/banner.jpg";
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const DEFAULT_VOLUME = 30; // 메인 영상 기본 음량 (%)

let DATA = null;          // 불러온 사이트 데이터
let PROGRAMS = [];        // 편성표 (재생 가능한 방송)
let CHANNEL_ID = null;    // 유튜브 채널 ID (최신 영상 API에서 받아옴)
let ROTATION_VIDEOS = [];
let YT_VIDEOS = [];       // 채널 영상, 최근 업로드 순
let current = null;

function esc(s){ return String(s ?? "").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
function ago(iso){
  const m = Math.max(1, Math.round((Date.now()-new Date(iso))/60000));
  if(m<60) return `${m}분 전`;
  const h = Math.round(m/60); if(h<24) return `${h}시간 전`;
  return new Date(iso).toLocaleDateString("ko-KR",{month:"long",day:"numeric"});
}

/* ---------- 유튜브 주소 해석 ---------- */
function parseYouTube(raw){
  let u; try{ u = new URL(raw); }catch(e){ return null; }
  const h = u.hostname.replace(/^www\.|^m\./,"");
  if(h==="youtu.be") return {video:u.pathname.slice(1).split("/")[0]};
  if(!h.endsWith("youtube.com") && !h.endsWith("youtube-nocookie.com")) return null;
  const p = u.pathname.split("/").filter(Boolean);
  if(p[0]==="watch" && u.searchParams.get("v")) return {video:u.searchParams.get("v")};
  if(["live","shorts","embed"].includes(p[0]) && p[1]) return {video:p[1], live:p[0]==="live"};
  if(p[0]==="channel" && p[1]) return {channel:p[1], live:true};
  // youtube.com/@핸들/live → 채널 ID를 알면 채널 라이브로 연결
  if(p[0] && p[0].startsWith("@") && p[1]==="live") return CHANNEL_ID ? {channel:CHANNEL_ID, live:true} : {handle:p[0], live:true};
  return null;
}
function youTubeEmbed(yt){
  // 클릭한 영상은 iframe이 준비되는 즉시 시작되도록 autoplay를 켭니다.
  // 초기에는 음소거로 시작하고 YouTube IFrame API가 볼륨을 30%로 맞춘 뒤 음소거를 해제합니다.
  const q = `autoplay=1&mute=1&playsinline=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;
  return yt.channel
    ? `https://www.youtube-nocookie.com/embed/live_stream?channel=${yt.channel}&${q}`
    : `https://www.youtube-nocookie.com/embed/${yt.video}?${q}`;
}
const ytThumb = id => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

/* ---------- 최신 동영상 로테이션: 한 편이 끝나면 다음 편, 마지막 다음은 처음으로 ---------- */
function mainRotation(news, ari, ariNews){
  function pickTwo(){
    const pool = news.slice();
    for(let i=pool.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [pool[i],pool[j]] = [pool[j],pool[i]];
    }
    return pool.slice(0,2);
  }
  const newsEpisode = Array.isArray(ariNews) && ariNews.length ? ariNews[0] : null;
  const queue = [];
  if(ari.length){
    ari.forEach((v,i)=>{
      queue.push(...pickTwo());
      if(i===0 && newsEpisode) queue.push(newsEpisode);
      queue.push(v);
    });
  }else{
    queue.push(...pickTwo());
    if(newsEpisode) queue.push(newsEpisode);
  }
  queue.refresh = ()=>mainRotation(news, ari, ariNews);
  return queue;
}
function rotation(queue, idx){
  if(idx >= queue.length && queue.refresh){
    queue = queue.refresh();
    ROTATION_VIDEOS = queue;
    idx = 0;
  }
  const i = idx % queue.length, v = queue[i];
  const videoId = v.yt || v.id;
  return {id:"yt-"+videoId+"-"+i, type:"youtube", url:"https://youtu.be/"+videoId, live:false, title:v.title, desc:v.summary||"", isAri:!!v.isAri, isAriNews:!!v.isAriNews, queue, idx:i};
}
let ytApi = null;
function loadYTApi(){
  return ytApi ||= new Promise(res=>{
    if(window.YT && YT.Player) return res();
    window.onYouTubeIframeAPIReady = res;
    const s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api"; document.head.appendChild(s);
  });
}
function bindYouTubePlayer(frame, src, next){
  loadYTApi().then(()=>{
    if(current !== src) return;   // 그사이 다른 방송을 골랐으면 무시
    new YT.Player(frame, {events:{
      onReady:e=>{
        if(current !== src) return;
        e.target.setVolume(DEFAULT_VOLUME);
        e.target.unMute();
        e.target.playVideo();
      },
      onStateChange:e=>{ if(next && e.data === YT.PlayerState.ENDED && current === src) next(); }
    }});
  });
}

/* ---------- 플레이어 ---------- */
const stage = document.getElementById("player");
let hls = null, raf = 0;
function stop(){
  cancelAnimationFrame(raf);
  if(hls){ hls.destroy(); hls = null; }
  stage.querySelectorAll("video").forEach(v=>{ v.pause(); v.removeAttribute("src"); v.load(); });
  stage.innerHTML = "";
}
function notice(html){ const d=document.createElement("div"); d.className="notice"; d.innerHTML=html; stage.appendChild(d); }
function videoEl(){
  const v = document.createElement("video");
  Object.assign(v,{controls:true,autoplay:true,muted:false,volume:DEFAULT_VOLUME / 100,playsInline:true});
  v.addEventListener("error",()=>{ stop(); notice("<strong>영상을 불러오지 못했습니다</strong><span>주소가 맞는지, 영상이 공개 상태인지 확인해 주세요.</span>"); });
  stage.appendChild(v); return v;
}
function play(src){
  current = src; stop();
  if(src.type==="demo") demo();
  else if(src.type==="youtube"){
    const yt = parseYouTube(src.url);
    if(!yt || yt.handle){ notice("<strong>유튜브 주소를 인식하지 못했습니다</strong><span>관리자 화면에서 주소를 확인해 주세요.</span>"); }
    else if(PREVIEW){
      const previewId = yt.video;
      const previewThumb = previewId ? ytThumb(previewId) : "";
      stage.innerHTML = previewThumb
        ? `<button class="yt-preview" type="button" data-youtube-preview="${esc(src.url)}" aria-label="${esc(src.title)} YouTube 미리보기">
            <img src="${esc(previewThumb)}" alt="">
            <span class="yt-preview-shade"></span>
            <span class="yt-preview-play">▶</span>
            <strong>${esc(src.title)}</strong>
            <small>YouTube Shorts · 실제 사이트에서 위 영상창 재생</small>
          </button>`
        : "";
      if(!stage.innerHTML) notice(`<strong>유튜브 영상을 미리 볼 수 없습니다</strong><span>실제 사이트에서는 위 영상창에서 바로 재생됩니다.</span>`);
    } else {
      const f = document.createElement("iframe");
      f.src = youTubeEmbed(yt) + (src.queue ? `&loop=1&playlist=${src.queue.map(v=>v.id).join(",")}` : ""); f.title = src.title;
      f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen"; f.allowFullscreen = true;
      stage.appendChild(f);
      bindYouTubePlayer(f, src, src.queue ? ()=>play(rotation(src.queue, src.idx + 1)) : null);
    }
  }
  else if(src.type==="hls"){
    if(PREVIEW){ notice(`<strong>라이브 스트림이 이 자리에 나옵니다</strong><span>미리보기 화면에서는 외부 스트림 연결이 막혀 있습니다. 실제 사이트에서는 HLS(.m3u8) 라이브가 바로 재생됩니다.</span>`); }
    else {
      const v = videoEl();
      if(v.canPlayType("application/vnd.apple.mpegurl")) v.src = src.url;
      else if(window.Hls && Hls.isSupported()){ hls = new Hls({lowLatencyMode:true}); hls.loadSource(src.url); hls.attachMedia(v); }
      else { stop(); notice("<strong>이 브라우저는 라이브 스트림을 지원하지 않습니다</strong>"); }
    }
  }
  else if(src.type==="file"){
    if(PREVIEW){ notice(`<strong>올린 영상 파일이 이 자리에 나옵니다</strong><span>관리자 화면에서 올린 영상이 이 자리에서 재생됩니다.</span>`); }
    else { videoEl().src = src.url; }
  }
  const badge = document.getElementById("nowBadge");
  badge.textContent = src.live ? "LIVE" : "다시보기";
  badge.className = "badge" + (src.live ? "" : " vod");
  document.getElementById("nowTitle").textContent = src.title;
  renderLineup();
  renderAI(src);
}

/* 테스트 방송 화면 (방송 영상이 아직 없을 때) */
function demo(){
  const c = document.createElement("canvas"); stage.appendChild(c);
  const ctx = c.getContext("2d");
  const lines = DATA.ticker.length ? DATA.ticker : ["VoB TV"];
  function frame(t){
    const r = stage.getBoundingClientRect(), dpr = Math.min(devicePixelRatio||1,2);
    if(c.width !== Math.round(r.width*dpr)){ c.width = Math.round(r.width*dpr); c.height = Math.round(r.height*dpr); }
    const W=c.width, H=c.height, s=W/1280;
    const g = ctx.createLinearGradient(0,0,W,H); g.addColorStop(0,"#1a0814"); g.addColorStop(.55,"#4a0f35"); g.addColorStop(1,"#8a1a52");
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    ctx.save(); ctx.globalAlpha=.06; ctx.fillStyle="#ffffff";
    for(let i=0;i<6;i++){ const x=((t*0.02*(REDUCED?0:1))+i*260)%(W+400)-200; ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x+120*s,0); ctx.lineTo(x-80*s,H); ctx.lineTo(x-200*s,H); ctx.fill(); }
    ctx.restore();
    ctx.fillStyle="#fff"; ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.font=`900 ${150*s}px "Playfair Display", Georgia, serif`; ctx.fillText("VoB TV", W/2, H*0.40);
    ctx.font=`500 ${22*s}px "IBM Plex Mono", monospace`; ctx.globalAlpha=.75;
    ctx.fillText("VICTORY BEGINS WITH OUR VOICE · 바른 시선, 당당한 목소리", W/2, H*0.40+105*s); ctx.globalAlpha=1;
    const ly=H-150*s;
    ctx.fillStyle="#8e1a52"; ctx.fillRect(48*s,ly,120*s,54*s);
    ctx.fillStyle="#fff"; ctx.fillRect(168*s,ly,W-216*s,54*s);
    ctx.textAlign="left"; ctx.font=`900 ${28*s}px "Playfair Display", Georgia, serif`;
    ctx.fillText("LIVE", 76*s, ly+28*s);
    ctx.fillStyle="#111a2e"; ctx.font=`700 ${26*s}px "IBM Plex Sans KR", sans-serif`;
    ctx.fillText(lines[Math.floor(t/5000)%lines.length], 192*s, ly+28*s);
    const now=new Date().toLocaleTimeString("ko-KR",{hour12:false});
    ctx.fillStyle="rgba(0,0,0,.35)"; ctx.fillRect(W-210*s,40*s,162*s,48*s);
    ctx.fillStyle="#fff"; ctx.textAlign="center"; ctx.font=`500 ${24*s}px "IBM Plex Mono", monospace`;
    ctx.fillText(now, W-129*s, 65*s);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
}

/* ---------- 화면 그리기 ---------- */
function toProgram(p){
  return {id:String(p.id), title:p.title, desc:p.description||"", type:p.type, url:p.url, live:!!p.is_live, time:p.time_label||"", main:!!p.is_main};
}
function renderLineup(){
  document.getElementById("lineup").innerHTML = PROGRAMS.length ? PROGRAMS.map(s=>{
    const yt = s.isAriNews ? (parseYouTube(s.url)?.video || "") : "";
    return `
    <li><button data-id="${esc(s.id)}"${yt ? ` data-ari-news-yt="${esc(yt)}"` : ""} aria-pressed="${!!current && (current.url && current.url===s.url || current.id===s.id)}">
      <time>${esc(s.time)}</time>
      <div><strong>${s.live?"":`<span class="tag vod">VOD</span>`}${esc(s.title)}</strong><span>${esc(s.desc)}</span></div>
    </button></li>`;
  }).join("") : `<li class="empty">편성된 방송이 없습니다.</li>`;
}
document.getElementById("lineup").addEventListener("click",e=>{
  const b = e.target.closest("button[data-id]"); if(!b) return;
  const s = PROGRAMS.find(x=>x.id===b.dataset.id); if(!s) return;

  const ariYt = b.getAttribute("data-ari-news-yt");
  if(ariYt){
    play({
      id:"ari-news-"+ariYt,
      type:"youtube",
      url:"https://youtu.be/"+ariYt,
      live:false,
      title:s.title,
      isAriNews:true
    });
    window.scrollTo({top:0,behavior:"smooth"});
    return;
  }
  play(s);
});

function renderTicker(){
  const t = DATA.ticker.length ? DATA.ticker : ["VoB TV · 바른 시선, 당당한 목소리"];
  document.getElementById("ticker").innerHTML = t.map(x=>`<span>● ${esc(x)}</span>`).join("");
}

function renderAds(){
  const bySlot = {}; DATA.ads.forEach(a=>bySlot[a.slot]=a);
  document.getElementById("ads").innerHTML = [1,2,3,4].map(n=>{
    const a = bySlot[n];
    if(a && a.image_url){
      const img = `<img src="${esc(a.image_url)}" alt="${esc(a.alt||"광고")}" loading="lazy"><span class="adtag">AD</span>`;
      return a.link_url ? `<a class="adslot" href="${esc(a.link_url)}" target="_blank" rel="noopener sponsored">${img}</a>` : `<div class="adslot">${img}</div>`;
    }
    return `<div class="adslot"><span class="adtag">AD</span><strong>광고 영역 ${n}</strong><small>300 × 125</small><em>광고 문의 · VoB TV</em></div>`;
  }).join("");
}

function shortUrl(s){
  const yt = s?.url && parseYouTube(s.url);
  return yt?.video ? `https://www.youtube.com/shorts/${yt.video}` : (s?.url || "https://www.youtube.com/@VoBTV1/shorts");
}
function renderShorts(){
  const section = document.getElementById("shorts");
  const row = document.getElementById("shortsRow");
  const shorts = Array.isArray(DATA?.shorts) ? DATA.shorts.filter(Boolean) : [];
  if(!shorts.length){
    section.hidden = true;
    return;
  }
  section.hidden = false;
  row.innerHTML = shorts.map((s,i)=>{
    const yt = s.url && parseYouTube(s.url);
    const id = yt?.video || "";
    const thumb = id ? ytThumb(id) : "";
    const fallbackStyle = !thumb ? ` style="background:linear-gradient(160deg,var(--brand),#241327 62%,#0e1831)"` : "";
    return `<article class="short-card">
      <button class="short" type="button" data-i="${i}" aria-label="${esc(s.title)} YouTube Shorts"${fallbackStyle}>
        ${thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">` : ""}
        <span class="short-badge" aria-hidden="true">Shorts</span>
        <span class="short-play" aria-hidden="true">▶</span>
      </button>
      <button class="short-title" type="button" data-i="${i}" title="${esc(s.title)}">${esc(s.title)}</button>
    </article>`;
  }).join("");
}

document.getElementById("player").addEventListener("click",e=>{
  const b = e.target.closest("[data-youtube-preview]");
  if(!b || !PREVIEW) return;
  const url = b.getAttribute("data-youtube-preview");
  const yt = parseYouTube(url);
  if(yt?.video){
    stage.innerHTML = "";
    const f = document.createElement("iframe");
    f.src = youTubeEmbed(yt);
    f.title = "YouTube Preview";
    f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    f.allowFullscreen = true;
    stage.appendChild(f);
  }
});

document.getElementById("shortsRow").addEventListener("click",e=>{
  const b = e.target.closest(".short[data-i]");
  if(!b) return;
  const s = DATA.shorts[Number(b.dataset.i)];
  const yt = s?.url && parseYouTube(s.url);
  if(!yt?.video){
    play({id:"short-"+(s?.id||Date.now()), type:"demo", live:false, title:s?.title||"VoB Shorts"});
    window.scrollTo({top:0,behavior:"smooth"});
    return;
  }
  play({
    id:"short-"+yt.video,
    type:"youtube",
    url:`https://www.youtube.com/shorts/${yt.video}`,
    live:false,
    title:s.title
  });
  window.scrollTo({top:0,behavior:"smooth"});
});


let newsFilter = null;
/* 기사 썸네일: 대표 이미지가 없으면 분야 색과 제목으로 VoB 썸네일을 그립니다 */
const SEC_HUE = {"정치":338,"경제":222,"사회":312,"국제":262,"문화":292};
function newsThumb(n, i){
  const h = SEC_HUE[n.section] ?? 330, seed = [...String(n.id||i)].reduce((a,c)=>a+c.charCodeAt(0),0);
  // 회전 각도가 기사마다 다른 3D 정육면체 선화
  const ay = seed%90/57, ax = .5+seed%37/80, V = [];
  for(let k=0;k<8;k++){
    let x=k&1?1:-1, y=k&2?1:-1, z=k&4?1:-1;
    [x,z] = [x*Math.cos(ay)-z*Math.sin(ay), x*Math.sin(ay)+z*Math.cos(ay)];
    [y,z] = [y*Math.cos(ax)-z*Math.sin(ax), y*Math.sin(ax)+z*Math.cos(ax)];
    const f = 3.2/(4.4-z); V.push([(x*f*34+250).toFixed(1),(y*f*34+56).toFixed(1)]);
  }
  const E = [[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]];
  const lines = E.map(([a,b])=>`<line x1="${V[a][0]}" y1="${V[a][1]}" x2="${V[b][0]}" y2="${V[b][1]}"/>`).join("");
  return `<div class="thumb gen" style="--h:${h}">
    <svg viewBox="0 0 320 180" aria-hidden="true"><g class="cube">${lines}</g></svg>
    <span class="k">${esc(n.section||"뉴스")}</span>
    <b class="hl">${esc(n.title)}</b>
    <i class="mk">Vo<em>B</em> NEWS</i></div>`;
}

function renderNews(){
  const list = (newsFilter ? DATA.news.filter(n=>n.section===newsFilter) : DATA.news).slice(0, 8);
  document.getElementById("newsNote").textContent = DATA.sample ? "예시 기사" : (newsFilter ? `${newsFilter} 기사` : "");
  document.getElementById("news").innerHTML = list.length ? list.map((n,i)=>{
    const href = n.link_url || `article.html?id=${encodeURIComponent(n.id)}`;
    const ext = !!n.link_url;
    const thumb = n.image_url
      ? `<div class="thumb img" style="background-image:url('${esc(n.image_url)}')"><span>${esc(n.section||"")}</span>${n.auto?`<em class="ai-img">AI 이미지</em>`:""}</div>`
      : newsThumb(n, i);
    return `<article class="card"><a href="${esc(href)}"${ext?' target="_blank" rel="noopener"':""}>${thumb}</a>
      <h3><a href="${esc(href)}"${ext?' target="_blank" rel="noopener"':""}>${esc(n.title)}</a></h3>
      ${n.summary?`<p>${esc(n.summary)}</p>`:""}
      <div class="meta">${esc(n.section||"")} · ${ago(n.published_at)}${n.auto?`<span class="ai-tag">AI 정리</span>`:""}</div></article>`;
  }).join("") : `<p class="empty">아직 올라온 기사가 없습니다.</p>`;
}
document.querySelector("nav").addEventListener("click",e=>{
  const a = e.target.closest("a"); if(!a) return;
  const sec = a.textContent.trim();
  if(["정치","경제","사회","문화"].includes(sec)){
    e.preventDefault(); newsFilter = sec; renderNews();
    document.querySelectorAll("nav a").forEach(x=>x.toggleAttribute("aria-current", x===a));
    document.getElementById("newsSec").scrollIntoView({behavior:"smooth"});
  } else if(sec==="홈"){
    newsFilter = null; renderNews();
    document.querySelectorAll("nav a").forEach(x=>x.toggleAttribute("aria-current", x===a));
  }
});

/* ---------- 유튜브 최신 영상 (Vercel 서버 함수 /api/youtube) ---------- */
async function loadYouTube(){
  if(PREVIEW || location.protocol==="file:") return;
  try{
    const ch = (window.VOB_CONFIG||{}).youtubeChannel || "@VoBTV1";
    const r = await fetch(`/api/youtube?channel=${encodeURIComponent(ch)}`);
    if(!r.ok) return;
    const j = await r.json();
    CHANNEL_ID = j.channelId || null;
    const vids = (j.videos || []).slice().sort((a,b)=>(Date.parse(b.published)||0) - (Date.parse(a.published)||0));
    YT_VIDEOS = vids;
    // Shorts와 ARI 뉴스가 같은 영상을 중복해서 보여주지 않도록 ARI 영상 ID를 먼저 제외합니다.
    let ariVideos = [];
    let projectWorks = [];
    try{
      projectWorks = await VOB.ariProjectVideos();
    }catch(e){}
    const ariProjectIds = new Set(projectWorks.map(v=>v.yt || v.id).filter(Boolean));
    const ariNewsVideos = vids
      .filter(v=>{
        const title = String(v.title || "").toLowerCase();
        return (title.includes("ari 뉴스") || title.includes("ari news"));
      })
      .sort((a,b)=>(Date.parse(b.published)||0)-(Date.parse(a.published)||0))
      .slice(0,1)
      .map(v=>({
        id:"yt-"+v.id,
        yt:v.id,
        title:v.title,
        published_at:v.published,
        isAriNews:true
      }));
    const ariKeyword = String((window.VOB_CONFIG||{}).ariKeyword || "ARI").toLowerCase();
    const ariNewsIds = new Set(
      vids.filter(v=>String(v.title||"").toLowerCase().includes(ariKeyword)).map(v=>v.id)
    );
    const ytShorts = vids
      .filter(v=>v.isShort && !ariProjectIds.has(v.id) && !ariNewsIds.has(v.id))
      .sort((a,b)=>(Date.parse(b.published)||0) - (Date.parse(a.published)||0));
    DATA.shorts = ytShorts.slice(0,7).map(v=>({
      id:v.id,
      title:v.title,
      url:`https://www.youtube.com/shorts/${v.id}`
    }));
    renderShorts();

    const longs = vids.filter(v=>!v.isShort);
    if(!longs.length) return;
    try{
      const episode = w => Number(w.episode) || Number((w.title.match(/(\d+)\s*화/)||[])[1]) || Infinity;
      const seen = new Set();
      ariVideos = projectWorks.slice().sort((a,b)=>{
        const difference = episode(a)-episode(b);
        return (Number.isNaN(difference)?0:difference)
          || (Date.parse(a.published_at)||0)-(Date.parse(b.published_at)||0);
      }).map(w=>({id:w.yt||parseYouTube(w.video_url||"")?.video,title:w.title,summary:w.summary||"",isAri:true}))
        .filter(v=>v.id && !seen.has(v.id) && seen.add(v.id));
    }catch(e){}
    const newsQueue = longs.slice(0,5);
    // 최신 5편 중 중복 없는 무작위 2편 뒤 아리 다음 회차를 재생합니다.
    const queue = mainRotation(newsQueue, ariVideos, ariNewsVideos);
    ROTATION_VIDEOS = queue;
    PROGRAMS = queue.map((v,i)=>({
      ...rotation(queue,i),
      time:v.isAriNews?"ARI 뉴스":(v.isAri?"아리":"뉴스"),
      desc:v.isAri?"아리 프로젝트 · 회차순 순환 재생":"",
      main:i===0
    })).filter((p,i,all)=>all.findIndex(x=>x.url===p.url)===i).concat(PROGRAMS.filter(p=>p.type!=="demo" && !p.id.startsWith("yt-")));
    renderLineup();
    document.getElementById("latest").hidden = false;
    document.getElementById("videos").innerHTML = longs.map(v=>`
      <button class="vcard" data-v="${esc(v.id)}" data-t="${esc(v.title)}">
        <div class="thumb img" style="background-image:url('${ytThumb(v.id)}')"></div>
        <strong>${esc(v.title)}</strong><small>${esc(v.publishedLabel || (v.published ? ago(v.published) : "채널 최신 영상"))}</small>
      </button>`).join("");
  }catch(e){ /* 최신 영상은 없어도 사이트는 정상 동작 */ }
}
document.getElementById("videos").addEventListener("click",e=>{
  const b = e.target.closest(".vcard"); if(!b) return;
  const index = ROTATION_VIDEOS.findIndex(v=>v.id===b.dataset.v);
  if(index >= 0) play(rotation(ROTATION_VIDEOS, index));
  else play({id:"yt-"+b.dataset.v, type:"youtube", url:`https://youtu.be/${b.dataset.v}`, live:false, title:b.dataset.t});
  window.scrollTo({top:0,behavior:"smooth"});
});

/* ---------- AI 브리핑 ---------- */
let capTimer=0, typeTimer=0;
function aiFor(src){
  const b = DATA.briefing || {};
  if(src.isAri) return {sum:[src.title,src.desc||"아리 프로젝트 영상입니다.","무작위 뉴스 2편에 이어 아리 프로젝트를 회차순으로 한 편씩 재생합니다."],cap:[src.title]};
  if(src.type === "youtube" && DATA.news.length) return {sum:DATA.news.slice(0,3).map(n=>n.summary || n.title), cap:[src.title]};
  if(src.main && b.lines && b.lines.length) return {sum:b.lines, cap:(b.captions&&b.captions.length)?b.captions:[src.title]};
  const kind = src.live ? "라이브" : "녹화 영상";
  return {sum:[`'${src.title}' ${kind}입니다.`, src.desc || "방송 내용을 정리하고 있습니다.", "VoB TV 유튜브 채널 @VoBTV1에서도 함께 볼 수 있습니다."], cap:[src.title]};
}
function typeInto(el,label,text){
  clearInterval(typeTimer);
  if(REDUCED){ el.innerHTML=`<b>${label}</b>${esc(text)}`; return; }
  let n=0;
  typeTimer=setInterval(()=>{ n++; el.innerHTML=`<b>${label}</b>${esc(text.slice(0,n))}<i class="caret"></i>`; if(n>=text.length) clearInterval(typeTimer); },45);
}
function renderAI(src){
  const a = aiFor(src);
  document.getElementById("aiSum").innerHTML = a.sum.slice(0,3).map((x,k)=>`<li style="--d:${k*0.35}s">${esc(x)}</li>`).join("");
  const st=document.getElementById("aiStatus"); st.textContent="분석 완료"; st.classList.remove("busy");
  st.textContent = DATA.news.length ? "주요 기사 요약" : "방송 안내";
  clearInterval(capTimer); let i=0;
  const cap=document.getElementById("aiCap");
  const show=()=>typeInto(cap,"AI 자막",a.cap[i++%a.cap.length]);
  show(); capTimer=setInterval(show,4500);
}

/* ---------- 시계 ---------- */
const clock = document.getElementById("clock");
// 한국 시간 기준: 2026년 10월 5일 (월) 21시 12분 54초
const fmtClock = new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",year:"numeric",month:"long",day:"numeric",weekday:"short",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});
const tick = ()=>{ const p = Object.fromEntries(fmtClock.formatToParts(new Date()).map(x=>[x.type,x.value]));
  clock.textContent = `${p.year}년 ${p.month} ${p.day}일 (${p.weekday}) ${p.hour}시 ${p.minute}분 ${p.second}초`; };
tick(); setInterval(tick, 1000);

/* ---------- 상단 배너: 이미지 위로 흐르는 입체 그래프 ---------- */
(function(){
  const box = document.getElementById("banner");
  const c = document.getElementById("bannerCanvas"), ctx = c.getContext("2d");
  if(BANNER_IMG){ const im=new Image(); im.alt="VoB TV 배너"; im.src=BANNER_IMG; box.insertBefore(im,c); box.classList.add("has-img"); }
  const COLS=46, ROWS=22;
  const h=(x,z)=>Math.sin(x*3.1+z*1.7)*.5+Math.sin(x*7.3-z*2.3)*.22+Math.cos(z*3.9+x*1.3)*.28;
  function draw(t){
    const r=box.getBoundingClientRect(), dpr=Math.min(devicePixelRatio||1,2);
    if(c.width!==Math.round(r.width*dpr)){ c.width=Math.round(r.width*dpr); c.height=Math.round(r.height*dpr); }
    const W=c.width, H=c.height, T=REDUCED?0:t/1000;
    ctx.clearRect(0,0,W,H);
    if(!BANNER_IMG){ ctx.fillStyle="#140812"; ctx.fillRect(0,0,W,H); }
    ctx.globalCompositeOperation="lighter";
    const horizon=H*0.42, camY=0.75, flow=T*0.9;
    const proj=(X,Y,Z)=>{ const k=1/(Z+0.35); return [W/2+X*k*W*0.35, horizon+(camY-Y)*k*H*0.55]; };
    const fade=sx=>.12+.88*Math.min(1,Math.abs(sx-W/2)/(W*0.28));
    const pts=[];
    for(let j=0;j<ROWS;j++){
      const z=ROWS-1-j, Z=0.25+z*0.14, zz=z*0.14+flow, row=[];
      for(let i=0;i<COLS;i++){ const X=(i/(COLS-1)-.5)*3.4, Y=h(X,zz)*0.45; row.push([...proj(X,Y,Z),Y,Z]); }
      pts.push(row);
    }
    for(let j=0;j<ROWS;j++){
      const depth=j/(ROWS-1);
      for(let i=1;i<COLS;i++){
        const [x0,y0,Y0]=pts[j][i-1], [x1,y1,Y1]=pts[j][i];
        const a=(.2+.6*depth)*fade((x0+x1)/2), hot=(Y0+Y1)/2>0.12;
        ctx.strokeStyle=hot?`rgba(255,70,130,${a})`:`rgba(90,130,240,${a*.75})`;
        ctx.lineWidth=(0.6+1.4*depth)*dpr;
        ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(x1,y1); ctx.stroke();
      }
    }
    for(let i=0;i<COLS;i+=3){
      ctx.beginPath();
      for(let j=0;j<ROWS;j++){ const [x,y]=pts[j][i]; j?ctx.lineTo(x,y):ctx.moveTo(x,y); }
      ctx.strokeStyle=`rgba(120,150,230,${.12*fade(pts[ROWS-1][i][0])})`; ctx.lineWidth=dpr; ctx.stroke();
    }
    for(let j=4;j<ROWS;j+=3) for(let i=2;i<COLS;i+=5){
      const [x,y,Y]=pts[j][i]; if(Y<0.1) continue;
      const len=Y*H*0.9*(j/ROWS), a=.55*fade(x)*(j/ROWS);
      const g=ctx.createLinearGradient(x,y,x,y-len); g.addColorStop(0,`rgba(255,90,140,${a})`); g.addColorStop(1,"rgba(255,90,140,0)");
      ctx.fillStyle=g; ctx.fillRect(x-1.5*dpr,y-len,3*dpr,len);
      ctx.fillStyle=`rgba(255,220,235,${a})`; ctx.beginPath(); ctx.arc(x,y,2.2*dpr,0,7); ctx.fill();
    }
    const sx=((T*0.18)%1.4-0.2)*W;
    const sg=ctx.createLinearGradient(sx-W*0.08,0,sx+W*0.08,0);
    sg.addColorStop(0,"rgba(255,255,255,0)"); sg.addColorStop(.5,"rgba(255,200,225,.10)"); sg.addColorStop(1,"rgba(255,255,255,0)");
    ctx.fillStyle=sg; ctx.fillRect(0,0,W,H);
    ctx.globalCompositeOperation="source-over";
    if(!REDUCED) requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
})();

/* 마우스 위치를 따라 카드에 빛 */
document.addEventListener("pointermove",e=>{
  const el=e.target.closest(".adslot,.lineup.row button,.ai"); if(!el) return;
  el.classList.add("spot"); const r=el.getBoundingClientRect();
  el.style.setProperty("--mx",(e.clientX-r.left)+"px"); el.style.setProperty("--my",(e.clientY-r.top)+"px");
});

/* ---------- 시작 ---------- */
(async function boot(){
  function show(data){
    DATA = data;
    PROGRAMS = DATA.programs.filter(p=>p.type !== "demo").map(toProgram);
    if(!DATA.ticker.length) DATA.ticker = DATA.news.slice(0,5).map(n=>n.title);
    renderTicker(); renderAds(); renderShorts(); renderNews(); renderLineup();
    if(!current && PROGRAMS.length) play(PROGRAMS.find(p=>p.main) || PROGRAMS[0]);
  }
  try{ DATA = await VOB.load(show); }
  catch(e){ console.error(e); DATA = Object.assign({sample:true}, VOB.SAMPLE); }
  show(DATA);
  // 유튜브 응답을 기다리는 동안에도 편성표와 방송 화면을 표시합니다.
  play(PROGRAMS.find(p=>p.main) || PROGRAMS.find(p=>p.live) || PROGRAMS[0]
    || {id:"demo", type:"demo", live:true, title:"VoB TV 종합뉴스", desc:""});
  const initial = current;
  await loadYouTube();
  if(current !== initial) return;
  // 무작위 뉴스 2편 뒤 아리 영상을 회차순으로 한 편씩 재생합니다.
  const queue = ROTATION_VIDEOS;
  const first = (queue.length && rotation(queue, 0))
    || PROGRAMS.find(p=>p.main) || PROGRAMS.find(p=>p.live) || PROGRAMS[0]
    || {id:"demo", type:"demo", live:true, main:true, title:"VoB TV 종합뉴스", desc:""};
  play(first);
})();
