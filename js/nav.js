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
