(function () {
  const SELECTOR = [
    '.panel',
    '.employee-hero',
    '.progress-card',
    '.calendar-shell',
    '.auth-card',
    '.uws-modal-card',
    '.liquid-day-card',
    '.account-menu',
    '.time-range-card',
    '.account-create-card',
    '.danger-zone-card'
  ].join(',');

  function updatePointerGlow(event) {
    const card = event.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 100;
    const y = ((event.clientY - rect.top) / Math.max(rect.height, 1)) * 100;
    card.style.setProperty('--liquid-x', `${Math.max(0, Math.min(100, x))}%`);
    card.style.setProperty('--liquid-y', `${Math.max(0, Math.min(100, y))}%`);
  }

  function resetPointerGlow(event) {
    event.currentTarget.style.setProperty('--liquid-x', '18%');
    event.currentTarget.style.setProperty('--liquid-y', '10%');
  }

  function bind(root = document) {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    root.querySelectorAll(SELECTOR).forEach((card) => {
      if (card.dataset.liquidBound === '1') return;
      card.dataset.liquidBound = '1';
      card.addEventListener('pointermove', updatePointerGlow, { passive: true });
      card.addEventListener('pointerleave', resetPointerGlow, { passive: true });
    });
  }

  function addFilter() {
    if (document.getElementById('uwsLiquidSvg')) return;
    const holder = document.createElement('div');
    holder.id = 'uwsLiquidSvg';
    holder.setAttribute('aria-hidden', 'true');
    holder.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
    holder.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" focusable="false">
        <defs>
          <filter id="uws-liquid-distortion" x="-6%" y="-6%" width="112%" height="112%" color-interpolation-filters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.008 0.014" numOctaves="1" seed="7" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="4" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>`;
    document.body.prepend(holder);
  }

  function observeDynamicCards() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches?.(SELECTOR)) bind(node.parentElement || document);
          else if (node.querySelector?.(SELECTOR)) bind(node);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function init() {
    addFilter();
    bind();
    observeDynamicCards();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
