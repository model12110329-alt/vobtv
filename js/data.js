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

  async function load(){
    if(!db) return Object.assign({sample:true}, SAMPLE);
    const [programs, news, shorts, ads, ticker, briefing] = await Promise.all([
      db.from("programs").select("*").order("sort").order("created_at"),
      db.from("news").select("id,section,title,summary,image_url,link_url,published_at").order("published_at",{ascending:false}).limit(12),
      db.from("shorts").select("*").order("sort"),
      db.from("ads").select("*").eq("active",true).order("slot"),
      db.from("ticker").select("*").eq("active",true).order("sort"),
      db.from("briefing").select("*").eq("id",1).maybeSingle(),
    ]);
    const bad = [programs, news, shorts, ads, ticker, briefing].find(r=>r.error);
    if(bad) throw bad.error;
    return {
      sample:false,
      programs: programs.data, news: news.data, shorts: shorts.data, ads: ads.data,
      ticker: ticker.data.map(t=>t.text),
      briefing: briefing.data || {lines:[], captions:[]},
    };
  }

  async function article(id){
    if(!db) return SAMPLE.news.find(n=>n.id===id) || null;
    const {data, error} = await db.from("news").select("*").eq("id",id).maybeSingle();
    if(error) throw error;
    return data;
  }

  window.VOB = {db, ready, load, article, SAMPLE, config:C};
})();
