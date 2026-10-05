// VoB TV 3D·4차원 효과
// 1) AI 브리핑의 'AI 코어': 4차원 정육면체(테서랙트)가 4차원 공간에서 회전하는 모습을 3D → 2D로 투영
// 2) 배경: 4차원 클리퍼드 토러스(점 구름)가 천천히 회전
// 3) 카드: 마우스 위치에 따라 3D로 기울어짐
(function(){
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // 4차원 회전: 두 축이 이루는 평면에서 회전
  function rot4(p, a, i, j){
    const c = Math.cos(a), s = Math.sin(a), q = p.slice();
    q[i] = p[i]*c - p[j]*s; q[j] = p[i]*s + p[j]*c; return q;
  }
  // 4D → 3D → 2D 원근 투영
  function project(p, W, H, scale, d4 = 2.6, d3 = 3.2){
    const k4 = 1/(d4 - p[3]);
    const x = p[0]*k4, y = p[1]*k4, z = p[2]*k4;
    const k3 = 1/(d3 - z);
    return [W/2 + x*k3*scale, H/2 + y*k3*scale, z, p[3]];
  }
  function fit(c){
    const r = c.getBoundingClientRect(), dpr = Math.min(devicePixelRatio||1, 2);
    const w = Math.round(r.width*dpr), h = Math.round(r.height*dpr);
    if(c.width !== w || c.height !== h){ c.width = w; c.height = h; }
    return dpr;
  }
  const mix = (a, b, t) => a.map((v,i)=>Math.round(v + (b[i]-v)*t));
  const BURG = [224,72,138], BLUE = [92,140,245], WHITE = [255,235,245];

  /* ---------- 테서랙트 ---------- */
  function tesseract(canvas){
    const ctx = canvas.getContext("2d");
    const V = [];
    for(let i=0;i<16;i++) V.push([i&1?1:-1, i&2?1:-1, i&4?1:-1, i&8?1:-1]);
    const E = [];
    for(let i=0;i<16;i++) for(let b=0;b<4;b++){ const j = i ^ (1<<b); if(i<j) E.push([i,j]); }
    function frame(t){
      const dpr = fit(canvas), W = canvas.width, H = canvas.height, T = REDUCED ? 1.2 : t/1000;
      ctx.clearRect(0,0,W,H);
      // 바닥 빛
      const g = ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,Math.min(W,H)*.55);
      g.addColorStop(0,"rgba(182,44,104,.28)"); g.addColorStop(.6,"rgba(63,111,216,.10)"); g.addColorStop(1,"rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
      const P = V.map(v=>{
        let p = rot4(v, T*0.55, 0, 3);   // XW 평면
        p = rot4(p, T*0.37, 1, 2);       // YZ 평면
        p = rot4(p, T*0.23, 2, 3);       // ZW 평면
        p = rot4(p, 0.6, 0, 2);
        return project(p, W, H, Math.min(W,H)*0.82);
      });
      ctx.lineCap = "round";
      ctx.globalCompositeOperation = "lighter";
      E.forEach(([a,b])=>{
        const pa = P[a], pb = P[b], w = (pa[3]+pb[3])/2;          // 4번째 축 깊이 → 색
        const col = mix(BLUE, BURG, (w+1)/2), depth = ((pa[2]+pb[2])/2 + 1)/2;
        ctx.strokeStyle = `rgba(${col},${.35+.55*depth})`;
        ctx.lineWidth = (1 + 1.8*depth)*dpr;
        ctx.shadowColor = `rgba(${col},.9)`; ctx.shadowBlur = 10*dpr;
        ctx.beginPath(); ctx.moveTo(pa[0],pa[1]); ctx.lineTo(pb[0],pb[1]); ctx.stroke();
      });
      P.forEach(p=>{
        const col = mix(BLUE, WHITE, (p[3]+1)/2);
        ctx.fillStyle = `rgba(${col},.95)`; ctx.shadowColor = `rgba(${col},1)`; ctx.shadowBlur = 14*dpr;
        ctx.beginPath(); ctx.arc(p[0],p[1],(1.6+1.6*(p[2]+1)/2)*dpr,0,7); ctx.fill();
      });
      ctx.shadowBlur = 0; ctx.globalCompositeOperation = "source-over";
      if(!REDUCED) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ---------- 배경: 4차원 클리퍼드 토러스 ---------- */
  function cliffordField(canvas){
    const ctx = canvas.getContext("2d");
    const N = 34, pts = [];
    for(let i=0;i<N;i++) for(let j=0;j<N;j++){
      const a = i/N*Math.PI*2, b = j/N*Math.PI*2;
      pts.push([Math.cos(a)*.95, Math.sin(a)*.95, Math.cos(b)*.95, Math.sin(b)*.95]);
    }
    function frame(t){
      const dpr = fit(canvas), W = canvas.width, H = canvas.height, T = REDUCED ? 2 : t/1000;
      ctx.clearRect(0,0,W,H);
      const S = Math.min(W,H)*0.9;
      const cx = W*0.78, cy = H*0.32;
      for(const v of pts){
        let p = rot4(v, T*0.08, 0, 3);
        p = rot4(p, T*0.05, 1, 2);
        p = rot4(p, T*0.03, 0, 1);
        const q = project(p, 0, 0, S, 2.4, 3.4);
        const depth = (q[2]+1)/2, col = mix(BLUE, BURG, (q[3]+1)/2);
        ctx.fillStyle = `rgba(${col},${.08+.32*depth})`;
        const r = (0.7+1.5*depth)*dpr;
        ctx.fillRect(cx+q[0]-r/2, cy+q[1]-r/2, r, r);
      }
      if(!REDUCED) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ---------- 카드 3D 기울기 ---------- */
  const TILT = ".adslot,.lineup.row button,.short,.vcard,.card";
  let tilted = null;
  document.addEventListener("pointermove", e=>{
    if(REDUCED || e.pointerType === "touch") return;
    const el = e.target.closest(TILT);
    if(tilted && tilted !== el){ tilted.style.transform = ""; tilted = null; }
    if(!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left)/r.width - .5, y = (e.clientY - r.top)/r.height - .5;
    el.style.transform = `perspective(700px) rotateX(${(-y*10).toFixed(2)}deg) rotateY(${(x*12).toFixed(2)}deg) translateZ(6px)`;
    tilted = el;
  });
  document.addEventListener("pointerleave", ()=>{ if(tilted){ tilted.style.transform = ""; tilted = null; } });

  const core = document.getElementById("aiCore");
  if(core) tesseract(core);
  const bg = document.getElementById("bg4d");
  if(bg) cliffordField(bg);
})();
