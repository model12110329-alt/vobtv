// Vercel 서버 함수: 유튜브 채널의 최신 영상 목록을 가져옵니다.
// 사용: /api/youtube?channel=@VoBTV1  (또는 UC로 시작하는 채널 ID)
// API 키 없이 유튜브 공개 RSS 피드를 읽습니다. 결과는 10분 동안 캐시됩니다.

const decode = s => s
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'");

async function resolveChannelId(channel) {
  if (/^UC[\w-]{22}$/.test(channel)) return channel;
  const handle = channel.startsWith("@") ? channel : "@" + channel;
  if (!/^@[\w.\-]{3,30}$/.test(handle)) throw new Error("채널 이름 형식이 올바르지 않습니다");
  const r = await fetch(`https://www.youtube.com/${handle}`, {
    headers: { "user-agent": "Mozilla/5.0", "accept-language": "ko-KR,ko;q=0.9" },
  });
  const html = await r.text();
  const m = html.match(/"channelId":"(UC[\w-]{22})"/) || html.match(/"externalId":"(UC[\w-]{22})"/) || html.match(/channel\/(UC[\w-]{22})/);
  if (!m) throw new Error("유튜브 채널을 찾지 못했습니다");
  return m[1];
}

module.exports = async (req, res) => {
  const channel = String(req.query.channel || process.env.YT_CHANNEL || "@VoBTV1").trim();
  try {
    const channelId = await resolveChannelId(channel);
    // 채널 전체 피드는 최근 15개뿐이라 숏츠가 많으면 동영상이 밀려납니다.
    // 그래서 '동영상만' 모은 재생목록(UULF…) 피드를 함께 읽어 합칩니다.
    const feeds = [
      `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
      `https://www.youtube.com/feeds/videos.xml?playlist_id=UULF${channelId.slice(2)}`,
    ];
    const xmls = await Promise.all(feeds.map(u => fetch(u).then(r => r.ok ? r.text() : "").catch(() => "")));
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
    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=3600");
    res.status(200).json({ channelId, videos });
  } catch (err) {
    res.status(502).json({ error: String((err && err.message) || err) });
  }
};
