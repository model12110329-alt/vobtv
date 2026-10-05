// VoB TV 메인 화면
// 미리보기(Artifact)에서는 외부 영상 삽입이 막혀 있어 VOB_PREVIEW=true 로 안내 문구를 보여줍니다.
const PREVIEW = window.VOB_PREVIEW === true;
const BANNER_IMG = "assets/banner.jpg";
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

let DATA = null;          // 불러온 사이트 데이터
let PROGRAMS = [];        // 편성표 (재생 가능한 방송)
let CHANNEL_ID = null;    // 유튜브 채널 ID (최신 영상 API에서 받아옴)
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
  const q = "autoplay=1&mute=1&playsinline=1&rel=0";
  return yt.channel
    ? `https://www.youtube-nocookie.com/embed/live_stream?channel=${yt.channel}&${q}`
    : `https://www.youtube-nocookie.com/embed/${yt.video}?${q}`;
}
const ytThumb = id => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

/* ---------- 최신 동영상 로테이션: 한 편이 끝나면 다음 편, 마지막 다음은 처음으로 ---------- */
function rotation(queue, idx){
  const i = idx % queue.length, v = queue[i];
  return {id:"yt-"+v.id, type:"youtube", url:`https://youtu.be/${v.id}`, live:false, title:v.title, desc:"", queue, idx:i};
}
let ytApi = null;
function loadYTApi(){
  return ytApi ||= new Promise(res=>{
    if(window.YT && YT.Player) return res();
    window.onYouTubeIframeAPIReady = res;
    const s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api"; document.head.appendChild(s);
  });
}
function whenEnded(frame, src, next){
  loadYTApi().then(()=>{
    if(current !== src) return;   // 그사이 다른 방송을 골랐으면 무시
    new YT.Player(frame, {events:{onStateChange:e=>{ if(e.data === YT.PlayerState.ENDED && current === src) next(); }}});
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
  Object.assign(v,{controls:true,autoplay:true,muted:true,playsInline:true});
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
      notice(`<strong>유튜브 ${src.live?"라이브":"영상"}이 이 자리에 나옵니다</strong><span>미리보기 화면에서는 유튜브 삽입이 막혀 있습니다. 실제 사이트에서는 여기서 바로 재생됩니다.</span><a href="${esc(src.url)}" target="_blank" rel="noopener">유튜브에서 보기 ↗</a>`);
    } else {
      const f = document.createElement("iframe");
      f.src = youTubeEmbed(yt) + (src.queue ? `&enablejsapi=1&origin=${encodeURIComponent(location.origin)}` : ""); f.title = src.title;
      f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen"; f.allowFullscreen = true;
      stage.appendChild(f);
      if(src.queue) whenEnded(f, src, ()=>play(rotation(src.queue, src.idx + 1)));
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
  document.getElementById("lineup").innerHTML = PROGRAMS.length ? PROGRAMS.map(s=>`
    <li><button data-id="${esc(s.id)}" aria-pressed="${!!current && current.id===s.id}">
      <time>${esc(s.time)}</time>
      <div><strong>${s.live?"":`<span class="tag vod">VOD</span>`}${esc(s.title)}</strong><span>${esc(s.desc)}</span></div>
    </button></li>`).join("") : `<li class="empty">편성된 방송이 없습니다.</li>`;
}
document.getElementById("lineup").addEventListener("click",e=>{
  const b = e.target.closest("button[data-id]"); if(!b) return;
  const s = PROGRAMS.find(x=>x.id===b.dataset.id); if(s) play(s);
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

const SHORT_HUES = [224,350,160,28,265,195];
let SHORT_ART = {};
fetch("data/shorts_art.json",{cache:"no-cache"}).then(r=>r.ok?r.json():{}).then(j=>{ SHORT_ART = j||{}; if(DATA) renderShorts(); }).catch(()=>{});
function renderShorts(){
  const row = document.getElementById("shortsRow");
  if(!DATA.shorts.length){ document.getElementById("shorts").hidden = true; return; }
  row.innerHTML = DATA.shorts.map((s,i)=>{
    const yt = s.url && parseYouTube(s.url);
    const art = yt && yt.video && SHORT_ART[yt.video];   // 매일 만드는 3D 실사풍 숏츠 삽화가 있으면 그것을 씁니다
    const bg = yt && yt.video ? `background-image:linear-gradient(transparent 40%,rgba(0,0,0,.4)),url('${art || ytThumb(yt.video)}')`
      : `background:linear-gradient(160deg,hsl(${330+(SHORT_HUES[i%6]%30)} 60% 38%),hsl(225 60% ${22+(i%3)*6}%))`;
    return `<button class="short" data-i="${i}" style="${bg}"><p>${esc(s.title)}</p>${art?`<em class="ai-img">AI 이미지</em>`:""}</button>`;
  }).join("");
}
document.getElementById("shortsRow").addEventListener("click",e=>{
  const b = e.target.closest(".short"); if(!b) return;
  const s = DATA.shorts[b.dataset.i];
  play(s.url ? {id:"short-"+s.id, type:"youtube", url:s.url, live:false, title:s.title} : {id:"short-"+s.id, type:"demo", live:false, title:s.title});
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
    const vids = (j.videos || []).slice().sort((a,b)=>new Date(b.published) - new Date(a.published));
    YT_VIDEOS = vids;
    // 관리자가 숏츠를 따로 등록하지 않았으면 채널의 숏츠를 자동으로 보여줍니다
    const ytShorts = vids.filter(v=>v.isShort);
    if(!DATA.shorts.length && ytShorts.length){
      DATA.shorts = ytShorts.slice(0,12).map(v=>({id:v.id, title:v.title, url:`https://www.youtube.com/shorts/${v.id}`}));
      document.getElementById("shorts").hidden = false;
      renderShorts();
    }
    const longs = vids.filter(v=>!v.isShort);
    if(!longs.length) return;
    document.getElementById("latest").hidden = false;
    document.getElementById("videos").innerHTML = longs.slice(0,5).map(v=>`
      <button class="vcard" data-v="${esc(v.id)}" data-t="${esc(v.title)}">
        <div class="thumb img" style="background-image:url('${ytThumb(v.id)}')"></div>
        <strong>${esc(v.title)}</strong><small>${ago(v.published)}</small>
      </button>`).join("");
  }catch(e){ /* 최신 영상은 없어도 사이트는 정상 동작 */ }
}
document.getElementById("videos").addEventListener("click",e=>{
  const b = e.target.closest(".vcard"); if(!b) return;
  play({id:"yt-"+b.dataset.v, type:"youtube", url:`https://youtu.be/${b.dataset.v}`, live:false, title:b.dataset.t});
  window.scrollTo({top:0,behavior:"smooth"});
});

/* ---------- AI 브리핑 ---------- */
let capTimer=0, typeTimer=0;
function aiFor(src){
  const b = DATA.briefing || {};
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
  setTimeout(()=>{ st.textContent="실시간 분석 중"; st.classList.add("busy"); },1600);
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
  try{ DATA = await VOB.load(); }
  catch(e){ console.error(e); DATA = Object.assign({sample:true}, VOB.SAMPLE); }
  PROGRAMS = DATA.programs.map(toProgram);
  renderTicker(); renderAds(); renderShorts(); renderNews();
  await loadYouTube();
  // 첫 화면은 유튜브 채널 최신 동영상(숏츠 제외) 최대 5편을 최근 순으로 이어서 재생합니다
  const queue = YT_VIDEOS.filter(x=>!x.isShort).slice(0, 5);
  const first = (queue.length && rotation(queue, 0))
    || PROGRAMS.find(p=>p.main) || PROGRAMS.find(p=>p.live) || PROGRAMS[0]
    || {id:"demo", type:"demo", live:true, main:true, title:"VoB TV 종합뉴스", desc:""};
  play(first);
})();
