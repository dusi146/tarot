/* Interruptible details animation; the native summary keeps keyboard support. */
(function (root) {
  'use strict';
  function accordion(details, summary, content, gsap, reducedMotion) {
    if (!details || !summary || !content) return null;
    let wanted = Boolean(details.open), animation = null, revision = 0;
    function setOpen(open, immediate = false) {
      wanted = open; const version = ++revision;
      animation?.kill();
      summary.setAttribute('aria-expanded', String(open));
      details.dataset.expanded = String(open);
      const current = details.open ? content.getBoundingClientRect().height : 0;
      if (open) details.open = true;
      if (immediate || reducedMotion) {
        details.open = open;
        gsap.set(content, { clearProps: 'height,opacity,transform,overflow' });
        return;
      }
      const full = content.scrollHeight || content.getBoundingClientRect().height;
      gsap.set(content, { height: current, overflow: 'hidden' });
      animation = gsap.to(content, {
        height: open ? full : 0, opacity: open ? 1 : 0, y: open ? 0 : -8,
        duration: open ? .62 : .44, ease: 'power3.inOut', overwrite: true,
        onComplete: () => {
          if (version !== revision) return;
          details.open = wanted;
          gsap.set(content, { clearProps: 'height,opacity,transform,overflow' });
        }
      });
    }
    summary.setAttribute('aria-expanded', String(wanted));
    summary.addEventListener('click', event => { event.preventDefault(); setOpen(!wanted); });
    return { close: immediate => setOpen(false, immediate), setOpen };
  }
  const api = { accordion };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TarotUI = api;
})(typeof window === 'object' ? window : this);
