// ARI 프로젝트 코너: 관리자가 올린 소설과, 유튜브에 올린 ARI 영상을 모아 보여줍니다.
// ari.html 에서는 전체 목록과 소설 읽기 화면, 첫 화면(index.html)에서는 최신 4편 미리보기.
(function(){
  const C = window.VOB_CONFIG || {};
  const esc = s => String(s ?? "").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const day = iso => new Date(iso).toLocaleDateString("ko-KR",{year:"numeric",month:"long",day:"numeric"});
  const ytThumb = id => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  const ytId = raw => { try{ const u = new URL(raw); if(u.hostname.endsWith("youtu.be")) return u.pathname.slice(1).split("/")[0];
    const p = u.pathname.split("/").filter(Boolean); return u.searchParams.get("v") || (["shorts","embed","live"].includes(p[0]) ? p[1] : null); }catch(e){ return null; } };
  const epLabel = w => [w.series, w.episode ? `${w.episode}화` : ""].filter(Boolean).join(" · ");
  // 표지가 없을 때: 제목 첫 글자로 만든 버건디-청색 표지
  const coverStyle = w => w.cover_url ? `background-image:url('${esc(w.cover_url)}')` : "";

  // 유튜브의 ARI 영상: 재생목록이 있으면 그것, 없으면 채널 영상 중 제목에 키워드가 든 것
  async function ytVideos(){
    if(location.protocol === "file:") return [];
    try{
      const q = C.ariPlaylist ? `playlist=${encodeURIComponent(C.ariPlaylist)}` : `channel=${encodeURIComponent(C.youtubeChannel || "@VoBTV1")}`;
      const r = await fetch(`/api/youtube?${q}`, {signal:AbortSignal.timeout(6000)}); if(!r.ok) return [];
      const vids = (await r.json()).videos || [];
      const kw = (C.ariKeyword || "ARI").toLowerCase();
      return (C.ariPlaylist ? vids : vids.filter(v => v.title.toLowerCase().includes(kw)))
        .map(v => ({id:"yt-"+v.id, kind:"video", yt:v.id, title:v.title, published_at:v.published}));
    }catch(e){ return []; }
  }
  let everythingPromise = null;
  function everything(){ return everythingPromise ||= collectEverything(); }
  async function collectEverything(){
    const [works, yts] = await Promise.all([VOB.ari(), ytVideos()]);
    const seen = new Set();
    const vids = works.filter(w=>w.kind==="video").map(w=>({...w, yt:ytId(w.video_url||"")}))
      .concat(yts).filter(v => v.yt && !seen.has(v.yt) && seen.add(v.yt));
    const novels = works.filter(w=>w.kind==="novel");
    const byDate = (a,b)=>new Date(b.published_at)-new Date(a.published_at);
    return {novels:novels.sort(byDate), videos:vids.sort(byDate)};
  }

  VOB.ariVideos = async () => (await everything()).videos;

  const novelCard = w => `<a class="ari-card novel" href="ari.html?id=${esc(w.id)}">
      <div class="ari-cover${w.cover_url?" img":""}" style="${coverStyle(w)}"><span class="kind">소설</span>${w.cover_url?"":`<b>${esc(w.title.slice(0,1))}</b>`}</div>
      <small>${esc(epLabel(w) || day(w.published_at))}</small><strong>${esc(w.title)}</strong>${w.summary?`<p>${esc(w.summary)}</p>`:""}</a>`;
  const videoCard = w => `<button class="ari-card video" type="button" data-yt="${esc(w.yt)}" data-t="${esc(w.title)}">
      <div class="ari-cover img wide" style="background-image:url('${esc(w.cover_url || ytThumb(w.yt))}')"><span class="kind">영상</span><i class="play" aria-hidden="true"></i></div>
      <small>${esc(epLabel(w) || day(w.published_at))}</small><strong>${esc(w.title)}</strong></button>`;

  /* ---------- 첫 화면 미리보기 ---------- */
  async function teaser(box){
    const {novels, videos} = await everything();
    const items = novels.map(w=>({w, t:"n"})).concat(videos.map(w=>({w, t:"v"})))
      .sort((a,b)=>new Date(b.w.published_at)-new Date(a.w.published_at)).slice(0,4);
    if(!items.length) return;
    box.innerHTML = items.map(({w,t}) => t==="n" ? novelCard(w) : videoCard(w).replace("<button","<a href=\"ari.html#v="+esc(w.yt)+"\"").replace(" type=\"button\"","").replace("</button>","</a>")).join("");
    document.getElementById("ariSec").hidden = false;
  }

  /* ---------- 소설 읽기 ---------- */
  async function reader(page, id){
    const w = await VOB.ari(id);
    if(!w || w.kind!=="novel"){ page.innerHTML = `<p class="empty">작품을 찾지 못했습니다.</p><a class="back" href="ari.html">← ARI 프로젝트</a>`; return; }
    document.title = `${w.title} · ARI 프로젝트 · VoB TV`;
    let nav = "";
    if(w.series){
      const list = (await VOB.ari()).filter(x=>x.kind==="novel" && x.series===w.series).sort((a,b)=>(a.episode||0)-(b.episode||0) || new Date(a.published_at)-new Date(b.published_at));
      const i = list.findIndex(x=>x.id===w.id), prev = list[i-1], next = list[i+1];
      nav = `<nav class="ari-eps" aria-label="회차">${prev?`<a href="ari.html?id=${esc(prev.id)}">← ${esc(epLabel(prev)||prev.title)}</a>`:"<span></span>"}${next?`<a href="ari.html?id=${esc(next.id)}">${esc(epLabel(next)||next.title)} →</a>`:""}</nav>`;
    }
    const body = (w.body || w.summary || "").split(/\n{2,}|\r\n\r\n/).map(p=>`<p>${esc(p).replace(/\n/g,"<br>")}</p>`).join("");
    page.innerHTML = `<article class="article ari-read">
      <div class="meta">ARI 프로젝트 · 소설${epLabel(w)?" · "+esc(epLabel(w)):""} · ${day(w.published_at)}</div>
      <h1>${esc(w.title)}</h1>
      ${w.cover_url?`<img src="${esc(w.cover_url)}" alt="">`:""}
      <div class="body">${body}</div>${nav}
      <a class="back" href="ari.html">← ARI 프로젝트</a></article>`;
  }

  /* ---------- 전체 목록 ---------- */
  async function list(page){
    const {novels, videos} = await everything();
    const stage = document.getElementById("ariStage");
    page.querySelector("#ariNovels").innerHTML = novels.length ? novels.map(novelCard).join("") : `<p class="empty">곧 첫 소설이 올라옵니다.</p>`;
    page.querySelector("#ariVideos").innerHTML = videos.length ? videos.map(videoCard).join("") : `<p class="empty">곧 첫 영상이 올라옵니다.</p>`;
    const show = (yt, title, auto) => {
      stage.hidden = false;
      stage.querySelector(".frame").innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(yt)}?rel=0&playsinline=1${auto?"&autoplay=1":""}" title="${esc(title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
      stage.querySelector("h2").textContent = title;
    };
    page.addEventListener("click", e=>{
      const b = e.target.closest("button[data-yt]"); if(!b) return;
      show(b.dataset.yt, b.dataset.t, true); stage.scrollIntoView({behavior:"smooth", block:"start"});
    });
    const want = (location.hash.match(/v=([\w-]+)/)||[])[1];
    const first = videos.find(v=>v.yt===want) || videos[0];
    if(first) show(first.yt, first.title, !!want);
    page.querySelectorAll(".ari-tabs button").forEach(b=>b.addEventListener("click",()=>{
      page.querySelectorAll(".ari-tabs button").forEach(x=>x.setAttribute("aria-selected", x===b));
      page.dataset.show = b.dataset.f;
    }));
  }

  const teaserBox = document.getElementById("ariTeaser");
  if(teaserBox) teaser(teaserBox);
  const page = document.getElementById("ariPage");
  if(page){
    const id = new URLSearchParams(location.search).get("id");
    if(id) reader(page, id); else list(page);
  }
})();
