// Vercel 서버 함수: 유튜브 채널의 최신 영상 목록을 가져옵니다.
// 사용: /api/youtube?channel=@VoBTV1  (또는 UC로 시작하는 채널 ID)
//       /api/youtube?playlist=PL…      (재생목록 하나만, 예: ARI 프로젝트)
// API 키 없이 유튜브 공개 RSS 피드를 읽습니다. 결과는 10분 동안 캐시됩니다.

const decode = s => s
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'");

const KNOWN_CHANNEL = "UCU3uy7lOyzXhFFYOOgxgpCA";
const FALLBACK_VIDEOS = [
  {id:"7n3cP196Bdc", title:"국정감사장서 제기된 민간인 사찰 의혹 #사찰 #김은혜", published:"", isShort:false},
  {id:"3dTqT1V3VdI", title:"국정감사장서 제기된 민간인 사찰 의혹 #사찰 #김은혜", published:"", isShort:false},
  {id:"KSirUfxPleg", title:"육영수 여사 서거후 박정희 대통령의 편지 전문", published:"", isShort:false},
];
const timedFetch = (url, options={}) => fetch(url, {...options, signal:AbortSignal.timeout(8000)});

function channelVideos(html, isShort=false){
  const match = html.match(/(?:var ytInitialData|window\["ytInitialData"\])\s*=\s*(\{.*?\});/s);
  if(!match) return [];
  let data; try { data = JSON.parse(match[1]); } catch(e){ return []; }
  const found = [], seen = new Set();
  function walk(node){
    if(!node || typeof node !== "object") return;
    const text = x => x?.content || x?.simpleText || (x?.runs || []).map(r=>r.text).join("");
    const add = (id, title, publishedLabel="", short=isShort) => {
      if(!id || !title || seen.has(id)) return;
      seen.add(id);
      found.push({id,title,published:"",publishedLabel,isShort:short});
    };
    const model = node.lockupViewModel;
    if(model?.contentType === "LOCKUP_CONTENT_TYPE_VIDEO"){
      const meta = model.metadata?.lockupMetadataViewModel;
      const rows = meta?.metadata?.contentMetadataViewModel?.metadataRows || [];
      const parts = rows.flatMap(row=>row.metadataParts || []);
      const publishedLabel = parts.map(p=>text(p.text)).find(t=>/ago|전|스트리밍|Streamed/i.test(t)) || "";
      add(model.contentId, text(meta?.title), publishedLabel);
    }
    const short = node.shortsLockupViewModel;
    if(short){
      const id = short.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId
        || short.entityId?.replace(/^shorts-shelf-item-/, "");
      add(id, text(short.overlayMetadata?.primaryText), "Shorts", true);
    }
    const reel = node.reelItemRenderer;
    if(reel) add(reel.videoId, text(reel.headline), "Shorts", true);
    const v = node.videoRenderer;
    if(v && v.videoId && v.lengthText && !seen.has(v.videoId)){
      add(v.videoId, text(v.title), text(v.publishedTimeText));
    }
    for(const child of Object.values(node)){
      if(Array.isArray(child)) child.forEach(walk); else if(child && typeof child==="object") walk(child);
    }
  }
  walk(data); return found;
}

async function resolveChannelId(channel) {
  if(channel.toLowerCase()==="@vobtv1") return KNOWN_CHANNEL;
  if (/^UC[\w-]{22}$/.test(channel)) return channel;
  const handle = channel.startsWith("@") ? channel : "@" + channel;
  if (!/^@[\w.\-]{3,30}$/.test(handle)) throw new Error("채널 이름 형식이 올바르지 않습니다");
  const r = await timedFetch(`https://www.youtube.com/${handle}`, {
    headers: { "user-agent": "Mozilla/5.0", "accept-language": "ko-KR,ko;q=0.9" },
  });
  const html = await r.text();
  const m = html.match(/"channelId":"(UC[\w-]{22})"/) || html.match(/"externalId":"(UC[\w-]{22})"/) || html.match(/channel\/(UC[\w-]{22})/);
  if (!m) throw new Error("유튜브 채널을 찾지 못했습니다");
  return m[1];
}

module.exports = async (req, res) => {
  const playlist = String(req.query.playlist || "").trim();
  if (playlist) {
    if (!/^[\w-]{10,64}$/.test(playlist)) return res.status(400).json({ error: "재생목록 주소 형식이 올바르지 않습니다" });
    try {
      const xml = await timedFetch(`https://www.youtube.com/feeds/videos.xml?playlist_id=${playlist}`).then(r => r.ok ? r.text() : "");
      const videos = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(m => {
        const get = re => (m[1].match(re) || [])[1] || "";
        return { id: get(/<yt:videoId>([^<]+)<\/yt:videoId>/), title: decode(get(/<title>([^<]*)<\/title>/)), published: get(/<published>([^<]+)<\/published>/) };
      }).filter(v => v.id);
      res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=3600");
      return res.status(200).json({ playlist, videos });
    } catch (err) {
      return res.status(502).json({ error: String((err && err.message) || err) });
    }
  }
  const channel = String(req.query.channel || process.env.YT_CHANNEL || "@VoBTV1").trim();
  try {
    const channelId = await resolveChannelId(channel);
    // 채널 전체 피드는 최근 15개뿐이라 숏츠가 많으면 동영상이 밀려납니다.
    // 그래서 '동영상만' 모은 재생목록(UULF…) 피드를 함께 읽어 합칩니다.
    const feeds = [
      `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
      `https://www.youtube.com/feeds/videos.xml?playlist_id=UULF${channelId.slice(2)}`,
    ];
    // RSS는 최근 15개로 제한되므로 공개 동영상·Shorts 탭도 함께 읽습니다.
    // 새 lockupViewModel 형식과 기존 videoRenderer 형식을 모두 지원합니다.
    const [xmls, pages] = await Promise.all([
      Promise.all(feeds.map(u => timedFetch(u).then(r => r.ok ? r.text() : "").catch(() => ""))),
      Promise.all(["videos", "shorts"].map(tab => timedFetch(`https://www.youtube.com/channel/${channelId}/${tab}`, {
        headers:{"user-agent":"Mozilla/5.0", "accept-language":"ko-KR,ko;q=0.9"}
      }).then(r => r.ok ? r.text() : "").catch(() => "")))
    ]);
    const seen = new Set();
    const videos = xmls.flatMap((xml, fi) => [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(m => {
      const e = m[1];
      const get = re => (e.match(re) || [])[1] || "";
      return {
        id: get(/<yt:videoId>([^<]+)<\/yt:videoId>/),
        title: decode(get(/<title>([^<]*)<\/title>/)),
        published: get(/<published>([^<]+)<\/published>/),
        isShort: fi === 0 && /\/shorts\//.test(get(/<link rel="alternate" href="([^"]+)"/)),
      };
    })).filter(v => v.id && !seen.has(v.id) && seen.add(v.id))
      .sort((a, b) => new Date(b.published) - new Date(a.published));
    const byId = new Map(videos.map(v=>[v.id, v]));
    const pageVideos = pages.flatMap((html,i)=>channelVideos(html, i===1));
    const resultVideos = pageVideos.map(v=>{
      const feed = byId.get(v.id);
      byId.delete(v.id);
      return {...v, published:feed?.published || ""};
    }).concat([...byId.values()]);
    let result = resultVideos.length ? resultVideos : videos;
    const fallback = !result.some(v=>!v.isShort) && channelId===KNOWN_CHANNEL;
    if(fallback) result = FALLBACK_VIDEOS.concat(result.filter(v=>v.isShort));
    res.setHeader("Cache-Control", fallback ? "s-maxage=60, stale-while-revalidate=300" : "s-maxage=600, stale-while-revalidate=3600");
    res.status(200).json({ channelId, videos:result, fallback });
  } catch (err) {
    res.status(502).json({ error: String((err && err.message) || err) });
  }
};
