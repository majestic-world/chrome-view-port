// Runs in every frame; only activates in the page framed directly by the Viewport Lab viewer.
(() => {
  if (window === window.top) return;
  const viewerOrigin = `chrome-extension://${chrome.runtime.id}`;
  const ancestors = location.ancestorOrigins;
  if (!ancestors || ancestors.length !== 1 || ancestors[0] !== viewerOrigin) return;

  const post = (message) => window.parent.postMessage({ source: 'vplab', ...message }, viewerOrigin);

  const style = document.createElement('style');
  style.textContent = '*{scrollbar-width:none!important}';
  const setOverlayScrollbars = (hide) => {
    if (hide) (document.head ?? document.documentElement)?.append(style);
    else style.remove();
  };

  const isClear = (el) => {
    if (!el) return true;
    const style = getComputedStyle(el);
    return style.backgroundImage === 'none' && /^(transparent|rgba\(.*,\s*0\))$/.test(style.backgroundColor);
  };

  // ---------- Touch emulation: finger cursor, drag to scroll, momentum ----------
  const DRAG_THRESHOLD = 6;
  const MAX_FLING = 5; // px/ms
  const DOT_IDLE = 'rgba(40, 40, 40, 0.28)';
  const DOT_PRESSED = 'rgba(40, 40, 40, 0.48)';
  const dot = document.createElement('vplab-touch');
  dot.setAttribute(
    'style',
    'all:initial;position:fixed;left:0;top:0;z-index:2147483647;display:none;width:26px;height:26px;margin:-13px 0 0 -13px;' +
      'border-radius:50%;pointer-events:none;box-shadow:0 0 0 1px rgba(255,255,255,.6),0 0 0 2px rgba(0,0,0,.15);',
  );
  const touchStyle = document.createElement('style');
  touchStyle.textContent =
    'html,html *{cursor:none!important}html.vplab-dragging,html.vplab-dragging *{user-select:none!important}';

  let touchEnabled = false;
  let gesture = null;
  let glideFrame = 0;
  let suppressClick = false;

  const showDot = (x, y, pressed) => {
    dot.style.transform = `translate(${x}px, ${y}px) scale(${pressed ? 0.85 : 1})`;
    dot.style.backgroundColor = pressed ? DOT_PRESSED : DOT_IDLE;
    dot.style.display = 'block';
  };

  const parentOf = (el) => el.parentElement ?? el.getRootNode()?.host ?? null;

  const canScroll = (el, axis, amount) => {
    const root = el === document.scrollingElement;
    const overflow = getComputedStyle(el)[axis === 'y' ? 'overflowY' : 'overflowX'];
    if (!root && !/auto|scroll|overlay/.test(overflow)) return false;
    const pos = axis === 'y' ? el.scrollTop : el.scrollLeft;
    const max = axis === 'y' ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth;
    return amount > 0 ? pos < max - 1 : pos > 0;
  };

  // Like a real touch: the gesture scrolls the innermost element that can move in its main direction.
  const findScroller = (start, dx, dy) => {
    const axis = Math.abs(dy) >= Math.abs(dx) ? 'y' : 'x';
    const amount = -(axis === 'y' ? dy : dx);
    for (let el = start instanceof Element ? start : null; el && el !== document.documentElement; el = parentOf(el)) {
      if (canScroll(el, axis, amount)) return el;
    }
    return document.scrollingElement ?? document.documentElement;
  };

  const stopGlide = () => {
    cancelAnimationFrame(glideFrame);
    glideFrame = 0;
  };

  const glide = (el, vx, vy) => {
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(now - last, 32);
      last = now;
      el.scrollBy({ left: vx * dt, top: vy * dt, behavior: 'instant' });
      const decay = 0.996 ** dt;
      vx *= decay;
      vy *= decay;
      glideFrame = Math.hypot(vx, vy) > 0.02 ? requestAnimationFrame(step) : 0;
    };
    glideFrame = requestAnimationFrame(step);
  };

  const isEditable = (el) => el instanceof Element && Boolean(el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'));

  const onPointerDown = (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    stopGlide();
    suppressClick = false;
    showDot(e.clientX, e.clientY, true);
    if (isEditable(e.target)) return;
    gesture = { x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, lastT: e.timeStamp, vx: 0, vy: 0, target: e.target, scroller: null };
  };

  const onPointerMove = (e) => {
    if (e.pointerType !== 'mouse') return;
    showDot(e.clientX, e.clientY, Boolean(e.buttons & 1));
    if (!gesture) return;
    if (!gesture.scroller) {
      const dx = e.clientX - gesture.x;
      const dy = e.clientY - gesture.y;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      gesture.scroller = findScroller(gesture.target, dx, dy);
      document.documentElement.classList.add('vplab-dragging');
      getSelection()?.removeAllRanges();
    }
    const mx = e.clientX - gesture.lastX;
    const my = e.clientY - gesture.lastY;
    const dt = e.timeStamp - gesture.lastT;
    gesture.scroller.scrollBy({ left: -mx, top: -my, behavior: 'instant' });
    if (dt > 0) {
      gesture.vx = 0.8 * (-mx / dt) + 0.2 * gesture.vx;
      gesture.vy = 0.8 * (-my / dt) + 0.2 * gesture.vy;
    }
    gesture.lastX = e.clientX;
    gesture.lastY = e.clientY;
    gesture.lastT = e.timeStamp;
  };

  const onPointerUp = (e) => {
    if (e.pointerType !== 'mouse') return;
    showDot(e.clientX, e.clientY, false);
    const done = gesture;
    gesture = null;
    if (!done?.scroller) return;
    document.documentElement.classList.remove('vplab-dragging');
    suppressClick = true;
    // Only fling if the finger was still moving when released.
    const clamp = (v) => Math.max(-MAX_FLING, Math.min(MAX_FLING, v));
    if (e.timeStamp - done.lastT < 80) glide(done.scroller, clamp(done.vx), clamp(done.vy));
  };

  const onClick = (e) => {
    if (!suppressClick) return;
    suppressClick = false;
    e.preventDefault();
    e.stopImmediatePropagation();
  };

  const onDragStart = (e) => e.preventDefault();
  const onLeave = () => (dot.style.display = 'none');

  const touchListeners = [
    ['pointerdown', onPointerDown],
    ['pointermove', onPointerMove],
    ['pointerup', onPointerUp],
    ['pointercancel', onPointerUp],
    ['click', onClick],
    ['dragstart', onDragStart],
  ];

  const ensureTouchNodes = () => {
    if (!touchEnabled || !document.documentElement) return;
    if (!touchStyle.isConnected) document.documentElement.append(touchStyle);
    if (!dot.isConnected) document.documentElement.append(dot);
  };

  const setTouch = (on) => {
    if (on === touchEnabled) return;
    touchEnabled = on;
    const method = on ? 'addEventListener' : 'removeEventListener';
    for (const [type, fn] of touchListeners) window[method](type, fn, true);
    document[method]('mouseleave', onLeave);
    if (on) {
      ensureTouchNodes();
    } else {
      stopGlide();
      gesture = null;
      dot.remove();
      touchStyle.remove();
      document.documentElement?.classList.remove('vplab-dragging');
    }
  };

  let last = '';
  const report = () => {
    const blankCanvas = isClear(document.documentElement) && isClear(document.body);
    const current = `${location.href}\n${document.title}\n${blankCanvas}`;
    if (current === last) return;
    last = current;
    post({ type: 'location', href: location.href, title: document.title, blankCanvas });
  };

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || event.origin !== viewerOrigin) return;
    const data = event.data;
    if (data?.source !== 'vplab') return;
    if (data.type === 'config') {
      setOverlayScrollbars(Boolean(data.hideScrollbars));
      setTouch(Boolean(data.touch));
    } else if (data.type === 'nav') {
      if (data.action === 'back') history.back();
      else if (data.action === 'forward') history.forward();
      else if (data.action === 'reload') location.reload();
    }
  });

  window.addEventListener('popstate', report);
  window.addEventListener('hashchange', report);
  document.addEventListener('DOMContentLoaded', report);
  // Frameworks that hydrate the whole document may drop our nodes; put them back.
  setInterval(() => {
    report();
    ensureTouchNodes();
  }, 500);
  post({ type: 'hello', href: location.href });
})();
