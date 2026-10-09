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

  // VoB 뉴스: 유튜브 전용 재생목록이 있으면 전체 사용, 없으면 채널 제목으로 자동 분류합니다.
  // 기존 ARI 뉴스 제목도 호환하여 개편 전 영상을 잃지 않습니다.
  const isVoBNewsTitle = title => /(?:vob\s*(?:tv\s*)?(?:뉴스|news)|ari\s*(?:뉴스|news)|아리\s*뉴스)/i.test(String(title || ""));
  async function ytNewsVideos(){
    if(location.protocol === "file:") return [];
    try{
      const playlist = String(C.newsPlaylist || "").trim();
      const source = playlist
        ? `/api/youtube?playlist=${encodeURIComponent(playlist)}`
        : `/api/youtube?channel=${encodeURIComponent(C.youtubeChannel || "@VoBTV1")}`;
      const r = await fetch(source, {signal:AbortSignal.timeout(10000)});
      if(!r.ok) return [];
      const vids = (await r.json()).videos || [];
      const hiddenIds = await VOB.hiddenYoutubeIds();
      return vids
        .filter(v => v && v.id && !hiddenIds.has(v.id) && (playlist || isVoBNewsTitle(v.title)))
        .sort((a,b)=>(Date.parse(b.published)||0)-(Date.parse(a.published)||0))
        .map(v => ({id:"yt-"+v.id, kind:"news", yt:v.id, title:v.title, published_at:v.published}));
    }catch(e){ return []; }
  }
  let everythingPromise = null;
  function everything(){ return everythingPromise ||= collectEverything(); }
  async function collectEverything(){
    const works = await VOB.ari();
    const vids = works.filter(w=>w.kind==="video")
      .map(w=>({...w, yt:ytId(w.video_url||"")}))
      .filter(v=>v.yt);
    const novels = works.filter(w=>w.kind==="novel");
    const byDate = (a,b)=>new Date(b.published_at)-new Date(a.published_at);
    return {novels:novels.sort(byDate), videos:vids.sort(byDate)};
  }

  // Separate APIs: ARI Project is managed from ari_works; ARI News comes from YouTube.
  VOB.ariProjectVideos = async () => (await everything()).videos;
  VOB.ariNewsVideos = async () => await ytNewsVideos();

  const novelCard = w => `<a class="ari-card novel" href="ari.html?id=${esc(w.id)}">
      <div class="ari-cover${w.cover_url?" img":""}" style="${coverStyle(w)}"><span class="kind">소설</span>${w.cover_url?"":`<b>${esc(w.title.slice(0,1))}</b>`}</div>
      <small>${esc(epLabel(w) || day(w.published_at))}</small><strong>${esc(w.title)}</strong>${w.summary?`<p>${esc(w.summary)}</p>`:""}</a>`;
  const videoCard = w => `<button class="ari-card video" type="button" data-yt="${esc(w.yt)}" data-t="${esc(w.title)}">
      <div class="ari-cover img wide" style="background-image:url('${esc(w.cover_url || ytThumb(w.yt))}')"><span class="kind">영상</span><i class="play" aria-hidden="true"></i></div>
      <small>${esc(epLabel(w) || day(w.published_at))}</small><strong>${esc(w.title)}</strong></button>`;

  /* ---------- ARI 프로젝트 메인 페이지 ---------- */

  async function projectTeaser(box){
    const {novels, videos} = await everything();
    const items = novels.map(w=>({w,t:"n"}))
      .concat(videos.map(w=>({w,t:"v"})))
      .sort((a,b)=>new Date(b.w.published_at)-new Date(a.w.published_at))
      .slice(0,4);
    if(!items.length) return;
    box.innerHTML = items.map(({w,t})=>{
      if(t==="n") return novelCard(w);
      return videoCard(w)
        .replace("<button","<a href=\"ari.html#v="+esc(w.yt)+"\"")
        .replace(" type=\"button\"","")
        .replace("</button>","</a>");
    }).join("");
    document.getElementById("ariProjectSec").hidden = false;
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
    const panels = Array.isArray(w.comic_panels) ? w.comic_panels.filter(p => p && p.image_url) : [];
    const comic = panels.length ? `<section class="ari-comic" aria-label="주요 장면 만화" style="margin:40px 0;padding-top:20px;border-top:1px solid #d9c8c3"><h2>주요 장면 만화</h2><div class="ari-comic-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:16px">${panels.map((p,i)=>`<figure style="margin:0;background:#151927;border-radius:12px;overflow:hidden"><img style="display:block;width:100%;aspect-ratio:16/9;object-fit:cover" src="${esc(p.image_url)}" alt="${esc(p.caption || "아리with 만화 "+(i+1))}" loading="lazy"><figcaption style="padding:12px 14px;color:#fff3df;font-size:15px">${esc(p.caption || "장면 "+(i+1))}</figcaption></figure>`).join("")}</div></section>` : "";
    page.innerHTML = `<article class="article ari-read">
      <div class="meta">ARI 프로젝트 · 소설${epLabel(w)?" · "+esc(epLabel(w)):""} · ${day(w.published_at)}</div>
      <h1>${esc(w.title)}</h1>
      ${w.cover_url?`<img src="${esc(w.cover_url)}" alt="">`:""}
      <div class="body">${body}</div>${comic}${nav}
      <a class="back" href="ari.html">← ARI 프로젝트</a></article>`;
  }

  /* ---------- 전체 목록 ---------- */
  async function list(page){
    const {novels, videos} = await everything();
    const stage = document.getElementById("ariStage");
    const newsShelf = page.querySelector("#ariNewsShelf");
    if(newsShelf){
      const news = (await ytNewsVideos())
        .sort((a,b)=>(Date.parse(b.published_at)||0)-(Date.parse(a.published_at)||0))
        .slice(0,7);
      newsShelf.innerHTML = news.map(v=>`
        <article class="short-card">
          <button class="short" type="button" data-yt="${esc(v.yt)}" data-t="${esc(v.title)}" aria-label="${esc(v.title)} VoB 뉴스">
            <img src="${esc(ytThumb(v.yt))}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">
            <span class="short-play" aria-hidden="true">▶</span>
            <span class="short-badge">VoB NEWS</span>
          </button>
          <button class="short-title" type="button" data-yt="${esc(v.yt)}" data-t="${esc(v.title)}" title="${esc(v.title)}">${esc(v.title)}</button>
        </article>`).join("");
      newsShelf.closest(".ari-news-sec").hidden = !news.length;
    }
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
  if(teaserBox){
    teaserBox.addEventListener("click", e=>{
      const b=e.target.closest("[data-ari-news-yt]");
      if(!b) return;
      const yt=b.getAttribute("data-ari-news-yt");
      const title=b.getAttribute("data-ari-news-title")||"VoB 뉴스";
      if(typeof play==="function"){
        play({id:"ari-news-"+yt,type:"youtube",url:`https://youtu.be/${yt}`,live:false,title});
        window.scrollTo({top:0,behavior:"smooth"});
      }
    });
    teaser(teaserBox);
  }

  async function homeNewsTeaser(box){
    const items = (await ytNewsVideos())
      .filter(v=>v.yt)
      .sort((a,b)=>(Date.parse(b.published_at)||0)-(Date.parse(a.published_at)||0))
      .slice(0,7);
    const section=document.getElementById("ariNewsHome");
    if(!items.length){
      box.innerHTML = '<p class="empty">현재 등록된 VoB 뉴스 영상이 없습니다.</p>';
      if(section) section.hidden=false;
      return;
    }
    box.innerHTML = items.map(w=>{
      const thumb = ytThumb(w.yt);
      return `<article class="ari-news-home-card">
        <button class="short ari-news-home-short" type="button" data-ari-home-yt="${esc(w.yt)}" data-ari-home-title="${esc(w.title)}" aria-label="${esc(w.title)} VoB 뉴스">
          <img src="${esc(thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">
          <span class="short-play" aria-hidden="true">▶</span>
          <span class="short-badge">VoB NEWS</span>
        </button>
        <button class="short-title ari-news-home-title" type="button" data-ari-home-yt="${esc(w.yt)}" data-ari-home-title="${esc(w.title)}" title="${esc(w.title)}">${esc(w.title)}</button>
      </article>`;
    }).join("");
    if(section) section.hidden=false;
  }

  const homeNewsBox = document.getElementById("ariNewsHomeRow");
  if(homeNewsBox){
    homeNewsBox.addEventListener("click", e=>{
      const b=e.target.closest("[data-ari-home-yt]");
      if(!b) return;
      const yt=b.getAttribute("data-ari-home-yt");
      const title=b.getAttribute("data-ari-home-title")||"VoB 뉴스";
      if(typeof play==="function"){
        play({id:"ari-home-news-"+yt,type:"youtube",url:`https://youtu.be/${yt}`,live:false,title});
        window.scrollTo({top:0,behavior:"smooth"});
      } else {
        location.href=`ari.html#news=${encodeURIComponent(yt)}`;
      }
    });
    homeNewsTeaser(homeNewsBox);
  }

  const projectBox = document.getElementById("ariProjectTeaser");
  if(projectBox) projectTeaser(projectBox);

  const page = document.getElementById("ariPage");
  if(page){
    const id = new URLSearchParams(location.search).get("id");
    if(id) reader(page, id); else list(page);
  }
})();
