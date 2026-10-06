// VoB TV 관리자 화면: 로그인한 관리자만 방송·기사·숏츠·광고·속보·ARI 프로젝트·AI 브리핑을 고칠 수 있습니다.
const db = VOB.db;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const msg = (t, bad) => { const m=$("msg"); m.textContent=t; m.style.color = bad ? "var(--onair)" : "var(--muted)"; };

const SECTIONS = ["정치","경제","사회","문화","국제","기타"].map(s=>[s,s]);
const TABLES = {
  programs: { label:"방송 편성", order:["sort",true], fields:[
    {k:"title", l:"방송 제목", t:"text", req:true},
    {k:"type", l:"종류", t:"select", o:[["youtube","유튜브 (영상·라이브)"],["hls","라이브 스트림 (.m3u8)"],["file","영상 파일"],["demo","테스트 화면"]]},
    {k:"url", l:"주소", t:"text", ph:"https://youtu.be/… · https://www.youtube.com/@VoBTV1/live · …/live.m3u8", upload:"video/*",
      help:"유튜브 영상·라이브 주소나 스트림 주소를 넣거나, 영상 파일을 올리세요 (무료 요금제는 파일당 50MB까지)."},
    {k:"is_live", l:"라이브 방송", t:"check"},
    {k:"is_main", l:"첫 화면에서 바로 재생", t:"check"},
    {k:"time_label", l:"시간 표시", t:"text", ph:"예: 12:00"},
    {k:"description", l:"설명", t:"text"},
    {k:"sort", l:"순서 (작을수록 앞)", t:"number"},
  ], row:r=>[r.title, `${r.is_live?"라이브":"녹화"}${r.time_label?" · "+r.time_label:""}${r.is_main?" · 첫 화면":""}`] },
  news: { label:"기사", order:["published_at",false], fields:[
    {k:"section", l:"분야", t:"select", o:SECTIONS},
    {k:"title", l:"제목", t:"text", req:true},
    {k:"summary", l:"요약 (첫 화면에 보이는 두 줄)", t:"text"},
    {k:"body", l:"본문", t:"textarea", help:"빈 줄로 문단을 나눕니다."},
    {k:"image_url", l:"대표 이미지", t:"text", upload:"image/*"},
    {k:"link_url", l:"외부 기사 주소 (선택)", t:"text", help:"넣으면 본문 대신 이 주소로 연결됩니다."},
    {k:"published_at", l:"게시 시각", t:"datetime"},
  ], row:r=>[r.title, `${r.section} · ${new Date(r.published_at).toLocaleString("ko-KR")}`] },
  shorts: { label:"숏츠", order:["sort",true], fields:[
    {k:"title", l:"제목", t:"text", req:true},
    {k:"url", l:"유튜브 숏츠 주소", t:"text", ph:"https://youtube.com/shorts/…"},
    {k:"sort", l:"순서", t:"number"},
  ], row:r=>[r.title, r.url||""] },
  ads: { label:"광고", order:["slot",true], fields:[
    {k:"slot", l:"광고 칸", t:"select", o:[["1","1번 칸"],["2","2번 칸"],["3","3번 칸"],["4","4번 칸"]]},
    {k:"image_url", l:"광고 이미지 (300×125 권장)", t:"text", upload:"image/*", req:true},
    {k:"link_url", l:"눌렀을 때 갈 주소", t:"text"},
    {k:"alt", l:"광고 설명 (광고주 이름 등)", t:"text"},
    {k:"active", l:"보이기", t:"check", def:true},
  ], row:r=>[`${r.slot}번 칸 · ${r.alt||"광고"}`, r.active?"보이는 중":"숨김"] },
  ticker: { label:"속보", order:["sort",true], fields:[
    {k:"text", l:"속보 문구", t:"text", req:true},
    {k:"sort", l:"순서", t:"number"},
    {k:"active", l:"보이기", t:"check", def:true},
  ], row:r=>[r.text, r.active?"보이는 중":"숨김"] },
  ari_works: { label:"ARI 프로젝트", order:["published_at",false], fields:[
    {k:"kind", l:"종류", t:"select", o:[["novel","소설"],["video","영상"]]},
    {k:"title", l:"제목", t:"text", req:true},
    {k:"series", l:"연재 제목 (선택)", t:"text", help:"같은 작품의 회차를 묶어 '이전 화 / 다음 화'로 이어집니다."},
    {k:"episode", l:"회차 (선택)", t:"number"},
    {k:"summary", l:"소개 (목록에 보이는 두 줄)", t:"text"},
    {k:"body", l:"소설 본문", t:"textarea", help:"빈 줄로 문단을 나눕니다. 영상이면 비워 두세요."},
    {k:"cover_url", l:"표지 이미지 (선택)", t:"text", upload:"image/*"},
    {k:"video_url", l:"유튜브 주소 (영상일 때)", t:"text", ph:"https://youtu.be/…",
      help:"유튜브에 올린 영상 주소를 넣으세요. 제목에 'ARI'가 들어간 채널 영상은 따로 등록하지 않아도 자동으로 보입니다."},
    {k:"published_at", l:"게시 시각", t:"datetime"},
  ], row:r=>[r.title, `${r.kind==="video"?"영상":"소설"}${r.series?" · "+r.series:""}${r.episode?" "+r.episode+"화":""} · ${new Date(r.published_at).toLocaleDateString("ko-KR")}`] },
  briefing: { label:"AI 브리핑", single:true },
};

let tab = "programs", rows = [], editing = null, confirmId = null;

/* ---------- 로그인 ---------- */
async function boot(){
  if(!VOB.ready){ $("setup").hidden = false; return; }
  const { data } = await db.auth.getSession();
  if(data.session) await enter(); else $("login").hidden = false;
}
$("loginForm").addEventListener("submit", async e=>{
  e.preventDefault();
  $("loginMsg").textContent = "확인 중…";
  const { error } = await db.auth.signInWithPassword({ email:$("email").value.trim(), password:$("pw").value });
  $("pw").value = "";
  if(error){ $("loginMsg").textContent = "이메일이나 비밀번호가 맞지 않습니다."; return; }
  await enter();
});
async function enter(){
  const { data, error } = await db.rpc("is_admin");
  if(error || !data){
    await db.auth.signOut();
    $("login").hidden = false;
    $("loginMsg").textContent = "관리자로 등록되지 않은 계정입니다. Supabase의 admins 표에 이메일을 추가해 주세요.";
    return;
  }
  $("login").hidden = true; $("panel").hidden = false;
  const { data:u } = await db.auth.getUser();
  $("who").textContent = u.user ? u.user.email : "";
  renderTabs(); await load();
}
$("logout").addEventListener("click", async ()=>{ await db.auth.signOut(); location.reload(); });

/* ---------- 탭 ---------- */
function renderTabs(){
  $("tabs").innerHTML = Object.entries(TABLES).map(([k,v])=>`<button type="button" role="tab" data-k="${k}" aria-selected="${k===tab}">${v.label}</button>`).join("");
}
$("tabs").addEventListener("click", e=>{
  const b = e.target.closest("button[data-k]"); if(!b) return;
  tab = b.dataset.k; editing = null; confirmId = null; msg(""); renderTabs(); load();
});

/* ---------- 목록 ---------- */
async function load(){
  const T = TABLES[tab];
  $("title").textContent = T.label;
  if(T.single) return renderBriefing();
  const { data, error } = await db.from(tab).select("*").order(T.order[0], {ascending:T.order[1]});
  if(error){
    const missing = tab==="ari_works" && /ari_works/.test(error.message||"");
    msg(missing ? "ARI 프로젝트 표가 아직 없습니다. Supabase SQL Editor에서 supabase/ari.sql 내용을 한 번 실행해 주세요." : "불러오지 못했습니다: " + error.message, true);
    rows = []; renderList(); renderForm(); return;
  }
  rows = data; renderList(); renderForm();
}
function renderList(){
  const T = TABLES[tab];
  $("list").innerHTML = rows.length ? rows.map(r=>{
    const [a,b] = T.row(r);
    const sure = confirmId === r.id;
    return `<li><div><strong>${esc(a)}</strong><small>${esc(b)}</small></div>
      <span class="act"><button class="btn ghost sm" data-edit="${r.id}">고치기</button>
      <button class="btn danger sm" data-del="${r.id}">${sure?"정말 지우기":"지우기"}</button></span></li>`;
  }).join("") : `<li class="empty">아직 없습니다. 아래에서 추가하세요.</li>`;
}
$("list").addEventListener("click", async e=>{
  const ed = e.target.closest("[data-edit]"), del = e.target.closest("[data-del]");
  if(ed){ editing = rows.find(r=>r.id===ed.dataset.edit); confirmId=null; renderList(); renderForm(); $("form").scrollIntoView({behavior:"smooth"}); }
  if(del){
    const id = del.dataset.del;
    if(confirmId !== id){ confirmId = id; renderList(); return; }
    const { error } = await db.from(tab).delete().eq("id", id);
    confirmId = null;
    if(error){ msg("지우지 못했습니다: " + error.message, true); return; }
    msg("지웠습니다."); if(editing && editing.id===id) editing=null; load();
  }
});

/* ---------- 입력 폼 ---------- */
const toLocal = iso => { const d = iso ? new Date(iso) : new Date(); d.setMinutes(d.getMinutes()-d.getTimezoneOffset()); return d.toISOString().slice(0,16); };
function renderForm(){
  const T = TABLES[tab], r = editing || {};
  $("formTitle").textContent = editing ? "고치기" : "새로 추가";
  $("fields").innerHTML = T.fields.map(f=>{
    const v = r[f.k] ?? (f.def ?? "");
    const id = "f_"+f.k;
    if(f.t==="check") return `<label class="field check"><input type="checkbox" id="${id}" ${(editing ? r[f.k] : f.def) ? "checked":""}> ${f.l}</label>`;
    let input;
    if(f.t==="select") input = `<select id="${id}">${f.o.map(([val,lab])=>`<option value="${val}" ${String(v)===val?"selected":""}>${lab}</option>`).join("")}</select>`;
    else if(f.t==="textarea") input = `<textarea id="${id}">${esc(v)}</textarea>`;
    else if(f.t==="datetime") input = `<input type="datetime-local" id="${id}" value="${toLocal(r[f.k])}">`;
    else input = `<input type="${f.t==="number"?"number":"text"}" id="${id}" value="${esc(v)}" placeholder="${esc(f.ph||"")}">`;
    const up = f.upload ? `<input type="file" accept="${f.upload}" data-up="${f.k}" aria-label="${f.l} 파일 올리기">` : "";
    const prev = f.upload==="image/*" && v ? `<img class="preview-img" src="${esc(v)}" alt="">` : "";
    return `<div class="field"><label for="${id}">${f.l}${f.req?" *":""}</label>${input}${up}${f.help?`<small>${f.help}</small>`:""}${prev}</div>`;
  }).join("");
  $("cancel").hidden = !editing;
}
$("fields").addEventListener("change", async e=>{
  const inp = e.target.closest("input[data-up]"); if(!inp || !inp.files[0]) return;
  const file = inp.files[0];
  const path = `${tab}/${Date.now()}-${file.name.replace(/[^\w.\-]/g,"_")}`;
  msg("파일을 올리는 중입니다…");
  const { error } = await db.storage.from("media").upload(path, file, { upsert:false, contentType:file.type });
  if(error){ msg("파일을 올리지 못했습니다: " + error.message, true); return; }
  const { data } = db.storage.from("media").getPublicUrl(path);
  $("f_"+inp.dataset.up).value = data.publicUrl;
  msg("파일을 올렸습니다. '저장'을 눌러야 반영됩니다.");
});
$("cancel").addEventListener("click", ()=>{ editing=null; renderForm(); msg(""); });
$("form").addEventListener("submit", async e=>{
  e.preventDefault();
  const T = TABLES[tab];
  if(T.single) return saveBriefing();
  const rec = {};
  for(const f of T.fields){
    const el = $("f_"+f.k);
    if(f.t==="check") rec[f.k] = el.checked;
    else if(f.t==="number") rec[f.k] = el.value==="" ? (f.k==="episode" ? null : 0) : Number(el.value);
    else if(f.t==="datetime") rec[f.k] = el.value ? new Date(el.value).toISOString() : new Date().toISOString();
    else if(f.k==="slot") rec[f.k] = Number(el.value);
    else rec[f.k] = el.value.trim() || null;
    if(f.req && !rec[f.k]){ msg(`'${f.l}'을(를) 넣어 주세요.`, true); return; }
  }
  const q = editing ? db.from(tab).update(rec).eq("id", editing.id).select().single() : db.from(tab).insert(rec).select().single();
  const { data, error } = await q;
  if(error){ msg("저장하지 못했습니다: " + error.message, true); return; }
  // 첫 화면 방송은 하나만
  if(tab==="programs" && rec.is_main) await db.from("programs").update({is_main:false}).neq("id", data.id);
  // 광고 칸은 칸마다 하나만 보이게
  if(tab==="ads" && rec.active) await db.from("ads").update({active:false}).eq("slot", rec.slot).neq("id", data.id);
  msg(editing ? "고쳤습니다. 사이트를 새로고침하면 보입니다." : "추가했습니다. 사이트를 새로고침하면 보입니다.");
  editing = null; load();
});

/* ---------- AI 브리핑 ---------- */
async function renderBriefing(){
  $("list").innerHTML = "";
  const { data, error } = await db.from("briefing").select("*").eq("id",1).maybeSingle();
  if(error){ msg("불러오지 못했습니다: " + error.message, true); return; }
  const b = data || {lines:[], captions:[]};
  $("formTitle").textContent = "첫 화면 방송의 AI 브리핑";
  $("fields").innerHTML = `
    <div class="field"><label for="b_lines">3줄 요약 (한 줄에 하나씩)</label><textarea id="b_lines">${esc((b.lines||[]).join("\n"))}</textarea></div>
    <div class="field"><label for="b_caps">AI 자막 문장 (한 줄에 하나씩, 차례로 흘러갑니다)</label><textarea id="b_caps">${esc((b.captions||[]).join("\n"))}</textarea></div>`;
  $("cancel").hidden = true;
}
async function saveBriefing(){
  const split = v => v.split("\n").map(s=>s.trim()).filter(Boolean);
  const { error } = await db.from("briefing").upsert({ id:1, lines:split($("b_lines").value), captions:split($("b_caps").value), updated_at:new Date().toISOString() });
  msg(error ? "저장하지 못했습니다: " + error.message : "저장했습니다. 사이트를 새로고침하면 보입니다.", !!error);
}

boot();
