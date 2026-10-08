/* Shared accessible mobile navigation; links remain visible without JavaScript. */
(() => {
  const header = document.querySelector('body > header');
  const toggle = header?.querySelector('.menu-toggle');
  const nav = header?.querySelector('#siteNav');
  if (!toggle || !nav) return;
  header.classList.add('nav-ready');
  toggle.hidden = false;
  const close = () => toggle.setAttribute('aria-expanded', 'false');
  toggle.addEventListener('click', () => {
    toggle.setAttribute('aria-expanded', String(toggle.getAttribute('aria-expanded') !== 'true'));
  });
  nav.addEventListener('click', e => {
    if (e.target.closest('a')) close();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      close();
      toggle.focus();
    }
  });
  document.addEventListener('click', e => {
    if (!header.contains(e.target)) close();
  });
  matchMedia('(max-width: 760px)').addEventListener('change', close);
})();

/* Animate the tab icon with cached PNG frames; SVG favicon animation is unreliable. */
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  if (reduced.matches) return;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const vertices = Array.from({length:16}, (_,i) => [0,1,2,3].map(b => i & (1 << b) ? 1 : -1));
  const edges = [];
  for (let i=0; i<16; i++) for (let b=0; b<4; b++) {
    const j = i ^ (1 << b);
    if (i < j) edges.push([i,j,b]);
  }
  const rotate = (p,a,i,j) => {
    const q = p.slice(), c = Math.cos(a), s = Math.sin(a);
    q[i] = p[i]*c - p[j]*s; q[j] = p[i]*s + p[j]*c;
    return q;
  };
  const frames = Array.from({length:48}, (_,frame) => {
    const angle = frame / 48 * Math.PI * 2;
    const points = vertices.map(v => {
      let p = rotate(v,angle,0,3);
      p = rotate(p,angle,1,2);
      p = rotate(p,0.55,0,2);
      const k4 = 1 / (3.5-p[3]);
      const k3 = 1 / (3.2-p[2]*k4);
      return [p[0]*k4*k3,p[1]*k4*k3];
    });
    const extent = Math.max(...points.flat().map(Math.abs));
    const scale = 25 / extent;
    ctx.fillStyle = '#201023'; ctx.fillRect(0,0,64,64);
    ctx.lineCap = ctx.lineJoin = 'round';
    edges.forEach(([a,b,axis]) => {
      ctx.strokeStyle = axis===3 ? '#84d9ff' : a & 8 ? '#fff5fc' : '#ff70bb';
      ctx.lineWidth = axis===3 ? 1.8 : 2.8;
      ctx.beginPath();
      ctx.moveTo(32+points[a][0]*scale,32+points[a][1]*scale);
      ctx.lineTo(32+points[b][0]*scale,32+points[b][1]*scale);
      ctx.stroke();
    });
    return canvas.toDataURL('image/png');
  });
  document.querySelectorAll('link[rel="icon"]').forEach(link => link.remove());
  const icon = document.createElement('link');
  icon.rel = 'icon'; icon.type = 'image/png'; icon.sizes = '64x64';
  icon.id = 'rotatingFavicon'; icon.href = frames[0];
  document.head.appendChild(icon);
  let frame = 0, timer;
  const sync = () => {
    clearInterval(timer);
    if (!document.hidden && !reduced.matches) {
      timer = setInterval(() => { icon.href = frames[frame = (frame+1)%frames.length]; },160);
    } else if (reduced.matches) {
      icon.href = '/favicon.svg'; icon.type = 'image/svg+xml';
    }
  };
  reduced.addEventListener('change', () => { icon.type = reduced.matches ? 'image/svg+xml' : 'image/png'; sync(); });
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pagehide', () => clearInterval(timer));
  window.addEventListener('pageshow', sync);
  sync();
})();
