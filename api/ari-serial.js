"use strict";

// 《아리with》 제1권 공개 샘플.
// KDP Select 독점 정책을 고려해 연재를 중지하고 프롤로그만 공개합니다.
const POSTS = [
  {
    id: "ari-v1-prologue",
    kind: "novel",
    title: "프롤로그 · 허용 오차",
    series: "《아리with》 제1권 · 허용 오차",
    episode: 0,
    summary: "설명되지 않는 거대한 공장. 한 노동자가 규격에서 벗어난 작은 존재 앞에서 손을 멈춘다.",
    body: `아주 오래전, 인간의 눈으로는 설명하기 어려운 거대한 공장이 있었다.

그 공장 아래층의 노동자들은 자신들이 만드는 존재가 지상에서 어떤 삶을 살게 되는지 알지 못했다. 위에서 내려오는 것은 목적이 아니라 수량과 규격이었다.

공장은 아리가 만들어지기 훨씬 전부터 움직이고 있었다. 수많은 인간 형상이 만들어졌고, 통과 판정과 폐기 판정이 반복됐다.

벨트는 일정한 속도로 돌아갔지만 노동자들에게는 늘 빠르게 느껴졌다. 하나를 놓치면 다음 형상이 밀려왔다. 위층에서는 오늘 처리할 숫자만 내려보냈고, 숫자의 이유는 알려 주지 않았다. 낮과 밤도 없는 조립실에는 피로만 차곡차곡 쌓였다.

최상층에서 열두 층을 내려가면 창문 없는 조립실이 있었다. 그곳에서 흙을 닮은 재료가 사람의 형상을 얻었다. 팔이 붙고, 눈꺼풀이 닫히고, 다리가 맞춰졌다.

그날 일곱째 벨트에서 작은 붉은 표시가 떴다.

[손 부품 수: 기준 미달.]

곧 다른 표시가 이어졌다.

[하지 운동축: 비대칭.]

경보는 울리지 않았다. 그런 표시는 드물지 않았다.

다만 이날에는 한 노동자가 손을 멈췄다.`,
    cover_url: "/assets/ari/serial/ari-v1-prologue.jpg",
    video_url: null,
    published_at: "2026-10-11T12:00:00.000Z"
  }
];

module.exports = function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const id = typeof req.query?.id === "string" ? req.query.id : "";
  if (id) {
    const post = POSTS.find(p => p.id === id);
    return post ? res.status(200).json(post) : res.status(404).json({ error: "Not published" });
  }

  return res.status(200).json(POSTS.map(({ body, ...meta }) => meta));
};
