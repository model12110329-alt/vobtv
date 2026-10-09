// 사이트 데이터 불러오기: Supabase가 설정되어 있으면 거기서, 아니면 예시 데이터를 씁니다.
(function(){
  const C = window.VOB_CONFIG || {};
  const ready = !!(C.supabaseUrl && C.supabaseAnonKey && window.supabase);
  const db = ready ? window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey) : null;

  const SAMPLE = {
    programs: [
      {id:"main", time_label:"지금", type:"demo", is_live:true, is_main:true, title:"VoB TV 종합뉴스", description:"메인 방송 채널 (테스트 화면)"},
      {id:"yt-live", time_label:"12:00", type:"youtube", is_live:true, title:"정오 라이브 브리핑", description:"유튜브 라이브 연결 예시", url:"https://www.youtube.com/watch?v=jfKfPfyJRdk"},
      {id:"hls", time_label:"14:00", type:"hls", is_live:true, title:"현장 연결 라이브", description:"HLS 스트림 예시", url:"https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8"},
      {id:"yt-vod", time_label:"16:00", type:"youtube", is_live:false, title:"기획 다큐: 우리 동네 이야기", description:"유튜브 녹화 영상 예시", url:"https://youtu.be/aqz-KE-bpKQ"},
      {id:"file", time_label:"18:00", type:"file", is_live:false, title:"저녁 뉴스 다시보기", description:"직접 올린 영상 파일 예시", url:"https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4"},
    ],
    shorts: [
      {id:"s1", title:"60초 오늘의 뉴스"},{id:"s2", title:"현장 뒷이야기"},{id:"s3", title:"애니로 보는 경제"},
      {id:"s4", title:"기자의 한마디"},{id:"s5", title:"동네 소식 한 컷"},{id:"s6", title:"주간 숏 브리핑"},
    ],
    news: [
      {id:"n1", section:"사회", title:"주말 도심 행사 앞두고 교통 통제 구간 안내", summary:"예시 기사입니다.", published_at:new Date(Date.now()-6e5).toISOString()},
      {id:"n2", section:"경제", title:"동네 상권 살리기, 소상공인 영상 홍보 지원 확대", summary:"예시 기사입니다.", published_at:new Date(Date.now()-19e5).toISOString()},
      {id:"n3", section:"문화", title:"독립 애니메이션 영화제, 단편 숏폼 부문 신설", summary:"예시 기사입니다.", published_at:new Date(Date.now()-36e5).toISOString()},
      {id:"n4", section:"정치", title:"지역 의회, 청년 미디어 창작 공간 예산 심의", summary:"예시 기사입니다.", published_at:new Date(Date.now()-72e5).toISOString()},
      {id:"n5", section:"사회", title:"가을 태풍 대비 행동 요령, 영상으로 정리했습니다", summary:"예시 기사입니다.", published_at:new Date(Date.now()-108e5).toISOString()},
      {id:"n6", section:"문화", title:"1인 크리에이터가 만드는 지역 뉴스, 새로운 흐름", summary:"예시 기사입니다.", published_at:new Date(Date.now()-144e5).toISOString()},
    ],
    ads: [],
    ticker: ["VoB TV 메인 방송이 시작되었습니다","정오 라이브 브리핑 12시 방송 예정","숏츠 채널에서 오늘의 뉴스를 60초로 확인하세요","VoB TV 유튜브 채널 @VoBTV1에서도 방송을 볼 수 있습니다"],
    briefing: {
      lines:["오늘 VoB TV 메인 방송은 지역 소식과 문화 뉴스 중심으로 편성됐습니다.","정오에는 유튜브 라이브 브리핑, 오후 2시에는 현장 연결이 이어집니다.","방송은 VoB TV 유튜브 채널에서도 함께 볼 수 있습니다."],
      captions:["안녕하세요, VoB TV 종합뉴스입니다.","오늘 첫 소식은 주말 도심 행사 소식입니다.","이어서 지역 문화 소식 전해드립니다."]
    },
  };

  // 매일 자동으로 만들어지는 기사 (저장소의 data/news.json)
  let dailyCache = null;
  async function daily(){
    if(dailyCache) return dailyCache;
    try{
      const r = await fetch("data/news.json", {cache:"no-cache"});
      dailyCache = r.ok ? await r.json() : [];
    }catch(e){ dailyCache = []; }
    return dailyCache;
  }
  const byDate = (a,b)=>new Date(b.published_at)-new Date(a.published_at);

  async function load(onUpdate){
    const auto = await daily();
    if(!db){
      const s = Object.assign({sample:true}, SAMPLE);
      if(auto.length){ s.news = auto.slice().sort(byDate).slice(0,12); s.sample = false; }
      return s;
    }
    // 저장된 기사는 외부 표가 느리거나 실패해도 먼저 표시합니다.
    const base = {
      sample:false, programs:[], news:auto.slice().sort(byDate).slice(0,12),
      shorts:[], ads:[], ticker:[], briefing:{lines:[], captions:[]}
    };
    if(onUpdate) onUpdate(base);
    async function query(request, fallback){
      const controller = new AbortController();
      const timer = setTimeout(()=>controller.abort(), 5000);
      try{
        const result = await request.abortSignal(controller.signal);
        if(result.error) { console.warn("VoB 데이터 일부를 불러오지 못했습니다", result.error); return fallback; }
        return result.data ?? fallback;
      }catch(e){ return fallback; }
      finally{ clearTimeout(timer); }
    }
    const [programs, news, shorts, ads, ticker, briefing] = await Promise.all([
      query(db.from("programs").select("*").order("sort").order("created_at"), []),
      query(db.from("news").select("id,section,title,summary,image_url,link_url,published_at").order("published_at",{ascending:false}).limit(12), []),
      query(db.from("shorts").select("*").order("sort"), []),
      query(db.from("ads").select("*").eq("active",true).order("slot"), []),
      query(db.from("ticker").select("*").eq("active",true).order("sort"), []),
      query(db.from("briefing").select("*").eq("id",1).maybeSingle(), base.briefing),
    ]);
    const merged = Array.from(new Map(news.concat(auto).map(n=>[n.id,n])).values());
    return {
      sample:false, programs, news:merged.sort(byDate).slice(0,12), shorts, ads,
      ticker:ticker.map(t=>t.text), briefing,
    };
  }

  async function article(id){
    const auto = (await daily()).find(n=>n.id===id);
    if(auto) return auto;
    if(!db) return SAMPLE.news.find(n=>n.id===id) || null;
    const {data, error} = await db.from("news").select("*").eq("id",id).maybeSingle();
    if(error) throw error;
    return data;
  }

  // ARI 프로젝트: 관리자가 올린 소설·영상 (표가 아직 없으면 빈 목록)
  // + 매주 자동 연재되는 소설 (저장소의 data/ari.json)
  let ariCache = null;
  async function ariAuto(){
    if(ariCache) return ariCache;
    let paths = ["data/ari.json"];
    try {
      const manifest = await fetch("data/ari-manifest.json", {cache:"no-cache"});
      if(manifest.ok){
        const list = await manifest.json();
        if(Array.isArray(list) && list.length) paths = list.filter(p => typeof p === "string" && p.startsWith("data/ari") && p.endsWith(".json") && !p.includes(".."));
      }
    } catch(e) {}
    const lists = await Promise.all(paths.map(async p => {
      try { const r = await fetch(p, {cache:"no-cache"}); return r.ok ? await r.json() : []; }
      catch(e){ return []; }
    }));
    ariCache = lists.flat().filter(w => w && w.id);
    return ariCache;
  }
  async function ariDb(id){
    if(!db) return id ? null : [];
    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(), 5000);
    try{
      if(id){
        const {data, error} = await db.from("ari_works").select("*").eq("id",id).maybeSingle().abortSignal(controller.signal);
        return error ? null : data;
      }
      const {data, error} = await db.from("ari_works").select("id,kind,title,series,episode,summary,cover_url,video_url,published_at").order("published_at",{ascending:false}).abortSignal(controller.signal);
      return error ? [] : data;
    }catch(e){ return id ? null : []; }
    finally{ clearTimeout(timer); }
  }
  async function ari(id){
    const auto = await ariAuto();
    if(id) return auto.find(w=>w.id===id) || (/^a-/.test(id) ? null : await ariDb(id));
    return auto.concat(await ariDb()).sort(byDate);
  }

  // 공개 데이터에서 숨긴 유튜브 ID 목록. 방문자에게도 같은 숨김 상태가 적용됩니다.
  let hiddenPromise = null;
  async function hiddenYoutubeIds(){
    if(!db) return new Set();
    if(!hiddenPromise) hiddenPromise = (async()=>{
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),5000);
      try{
        const {data,error}=await db.from("hidden_youtube_videos").select("video_id").abortSignal(controller.signal);
        if(error) return new Set();
        return new Set((data||[]).map(row=>row.video_id));
      }catch(e){return new Set()}
      finally{clearTimeout(timer)}
    })();
    return hiddenPromise;
  }
  window.VOB = {db, ready, load, article, ari, hiddenYoutubeIds, SAMPLE, config:C};
})();
