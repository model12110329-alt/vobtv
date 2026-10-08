// Return article-specific metadata before JavaScript runs so link previews can read it.
const fs = require("node:fs");
const path = require("node:path");
const news = require("../data/news.json");
const template = fs.readFileSync(path.join(__dirname, "..", "article.html"), "utf8");
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
}[c]));
const origin = "https://vobtv.kr";

module.exports = (req, res) => {
  const id = String(req.query.id || "");
  const article = news.find(item => item.id === id);
  const title = article ? `${article.title} · VoB TV` : "VoB TV 기사";
  const description = article?.summary || article?.subtitle || "VoB TV · 바른 시선, 당당한 목소리";
  const url = `${origin}/article.html${id ? `?id=${encodeURIComponent(id)}` : ""}`;
  const image = new URL(article?.image_url || "/assets/banner.jpg", origin).href;
  const metadata = `
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="article">
<meta property="og:locale" content="ko_KR">
<meta property="og:site_name" content="VoB TV">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:secure_url" content="${esc(image)}">
<meta property="og:image:alt" content="${esc(article?.image_alt || article?.title || "VoB TV")}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">`;
  const html = template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(description)}">`)
    .replace("</head>", `${metadata}\n</head>`);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60, must-revalidate");
  res.status(200).send(html);
};
