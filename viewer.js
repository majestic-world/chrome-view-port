import { BEZELS, DEVICES, RESPONSIVE_ID } from './devices.js';

const PREFS_KEY = 'prefs';
const MIN_SIZE = 50;
const MAX_SIZE = 4096;
const ZOOMS = ['fit', '25', '50', '75', '100', '125', '150'];
// Must match .stage padding and .caption margin in viewer.css.
const STAGE_PAD_X = 32;
const STAGE_PAD_Y = 28 + 20;
const CAPTION_SPACE = 22 + 24;
const HANDLE_SPACE = 24;

const DEFAULT_PREFS = {
  deviceId: 'iphone-17-pro',
  landscape: false,
  zoom: 'fit',
  bezel: true,
  custom: { width: 430, height: 932 },
};

const svg = (body) => `<svg viewBox="0 0 24 24">${body}</svg>`;
const GROUPS = [
  { type: 'phone', label: 'Celular', icon: svg('<rect x="7" y="2" width="10" height="20" rx="2"/>') },
  { type: 'tablet', label: 'Tablet', icon: svg('<rect x="4" y="2" width="16" height="20" rx="2"/>') },
  { type: 'laptop', label: 'Notebook', icon: svg('<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/>') },
];
const RESPONSIVE_ICON = svg('<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>');

const $ = (id) => document.getElementById(id);
const ui = {
  stage: $('stage'),
  sizer: $('sizer'),
  device: $('device'),
  screen: $('screen'),
  frame: $('frame'),
  empty: $('empty'),
  caption: $('caption'),
  devices: $('devices'),
  urlForm: $('urlForm'),
  url: $('url'),
  back: $('back'),
  forward: $('forward'),
  reload: $('reload'),
  width: $('width'),
  height: $('height'),
  rotate: $('rotate'),
  zoom: $('zoom'),
  bezel: $('bezel'),
  exit: $('exit'),
  theme: $('theme'),
};

const state = {
  prefs: structuredClone(DEFAULT_PREFS),
  url: '',
  tabId: null,
  bridged: false,
  scale: 1,
  drag: null,
};

const clampSize = (value) => Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(value)));
const currentDevice = () => DEVICES.find((device) => device.id === state.prefs.deviceId) ?? null;

function viewportSize() {
  const device = currentDevice();
  if (!device) return { ...state.prefs.custom };
  return state.prefs.landscape
    ? { width: device.height, height: device.width }
    : { width: device.width, height: device.height };
}

// ---------- Preferences ----------

async function loadPrefs() {
  const { [PREFS_KEY]: saved } = await chrome.storage.local.get(PREFS_KEY);
  if (!saved) return;
  const prefs = { ...DEFAULT_PREFS, ...saved, custom: { ...DEFAULT_PREFS.custom, ...saved.custom } };
  if (prefs.deviceId !== RESPONSIVE_ID && !DEVICES.some((d) => d.id === prefs.deviceId)) prefs.deviceId = DEFAULT_PREFS.deviceId;
  if (!ZOOMS.includes(prefs.zoom)) prefs.zoom = DEFAULT_PREFS.zoom;
  prefs.custom = { width: clampSize(prefs.custom.width), height: clampSize(prefs.custom.height) };
  state.prefs = prefs;
}

const savePrefs = () => chrome.storage.local.set({ [PREFS_KEY]: state.prefs });

function commit() {
  render();
  savePrefs();
  sendConfig();
}

// ---------- Rendering ----------

function resolveScale(outerWidth, outerHeight) {
  if (state.prefs.zoom !== 'fit') return Number(state.prefs.zoom) / 100;
  const handles = currentDevice() ? 0 : HANDLE_SPACE;
  const availWidth = ui.stage.clientWidth - STAGE_PAD_X * 2 - handles * 2;
  const availHeight = ui.stage.clientHeight - STAGE_PAD_Y - CAPTION_SPACE - handles;
  return Math.max(0.1, Math.min(1, availWidth / outerWidth, availHeight / outerHeight));
}

function render() {
  const device = currentDevice();
  const { width, height } = viewportSize();
  const bezel = device && state.prefs.bezel ? BEZELS[device.type] : null;
  const pad = bezel?.pad ?? 0;
  const outerWidth = width + pad * 2;
  const outerHeight = height + pad * 2;
  const scale = state.drag?.scale ?? resolveScale(outerWidth, outerHeight);
  state.scale = scale;

  ui.device.classList.toggle('bare', !bezel);
  ui.device.style.setProperty('--pad', `${pad}px`);
  ui.device.style.setProperty('--outer', `${bezel?.outer ?? 0}px`);
  ui.device.style.setProperty('--inner', `${bezel?.inner ?? 0}px`);
  ui.device.style.setProperty('--hair', `${1 / scale}px`);
  ui.device.style.transform = `scale(${scale})`;
  ui.screen.style.width = `${width}px`;
  ui.screen.style.height = `${height}px`;
  ui.sizer.style.width = `${outerWidth * scale}px`;
  ui.sizer.style.height = `${outerHeight * scale}px`;
  document.body.classList.toggle('responsive', !device);

  for (const button of ui.devices.querySelectorAll('.device-btn')) {
    button.classList.toggle('active', button.dataset.id === state.prefs.deviceId);
  }
  positionIndicator();
  if (document.activeElement !== ui.width) ui.width.value = width;
  if (document.activeElement !== ui.height) ui.height.value = height;
  ui.zoom.value = state.prefs.zoom;
  ui.bezel.disabled = !device;
  ui.bezel.setAttribute('aria-pressed', String(Boolean(bezel)));

  const parts = [
    device?.name ?? 'Livre',
    `${width} × ${height}`,
    device ? `DPR ${device.dpr}` : null,
    state.prefs.landscape && device ? 'Paisagem' : null,
    `${Math.round(scale * 100)}%`,
  ].filter(Boolean);
  ui.caption.replaceChildren(
    ...parts.map((text, index) => {
      const span = document.createElement('span');
      if (index === 0) span.append(Object.assign(document.createElement('b'), { textContent: text }));
      else span.textContent = text;
      return span;
    }),
  );
}

function buildDeviceNav() {
  const makeButton = (id, label, title) => {
    const button = Object.assign(document.createElement('button'), { type: 'button', className: 'device-btn', textContent: label, title });
    button.dataset.id = id;
    return button;
  };
  const makeGroup = (label, icon, buttons) => {
    const group = Object.assign(document.createElement('div'), { className: 'group', title: label });
    group.innerHTML = `<span class="group-icon">${icon}</span>`;
    group.append(...buttons);
    return group;
  };

  const groups = GROUPS.map(({ type, label, icon }) =>
    makeGroup(
      label,
      icon,
      DEVICES.filter((d) => d.type === type).map((d) => makeButton(d.id, d.label, `${d.name} — ${d.width} × ${d.height}`)),
    ),
  );
  groups.push(makeGroup('Livre', RESPONSIVE_ICON, [makeButton(RESPONSIVE_ID, 'Livre', 'Redimensionamento livre')]));

  const indicator = Object.assign(document.createElement('span'), { className: 'indicator instant' });
  const children = [indicator];
  groups.forEach((group, index) => {
    if (index > 0) children.push(Object.assign(document.createElement('span'), { className: 'sep' }));
    children.push(group);
  });
  ui.devices.replaceChildren(...children);
  ui.indicator = indicator;
}

// Slides the selection chip under the active device; first placement (and font swap) is instant.
function positionIndicator() {
  const active = ui.devices.querySelector('.device-btn.active');
  if (!active) return;
  ui.indicator.style.setProperty('--x', `${active.offsetLeft}px`);
  ui.indicator.style.setProperty('--w', `${active.offsetWidth}px`);
}

function settleIndicator() {
  ui.indicator.classList.add('instant');
  positionIndicator();
  requestAnimationFrame(() => requestAnimationFrame(() => ui.indicator.classList.remove('instant')));
}

// ---------- Page loading ----------

const PRIVATE_HOST = /^(localhost|127\.|0\.0\.0\.0|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|[^/]*\.local(?=[:/]|$))/i;

function parseUrl(raw) {
  const input = raw.trim();
  if (!input) return { ok: false, error: 'Digite uma URL para começar.' };
  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(input) && !/^[^/]+:\d+(\/|$)/.test(input)
    ? input
    : `${PRIVATE_HOST.test(input) ? 'http' : 'https'}://${input}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, error: `URL inválida: ${input}` };
  }
  if (!['http:', 'https:', 'file:'].includes(url.protocol)) {
    return { ok: false, error: `O Chrome não permite exibir ${url.protocol} dentro de outra página.` };
  }
  return { ok: true, url: url.href };
}

function showEmpty(message) {
  ui.screen.classList.add('is-empty');
  ui.empty.textContent = message;
}

function setLoading(loading) {
  document.body.classList.toggle('loading', loading);
}

function updateNavButtons() {
  ui.back.disabled = !state.bridged;
  ui.forward.disabled = !state.bridged;
  ui.reload.disabled = !state.url;
  ui.exit.disabled = !state.url;
}

function persistUrl() {
  history.replaceState(null, '', `${location.pathname}?u=${encodeURIComponent(state.url)}`);
  if (state.tabId !== null) chrome.storage.session.set({ [`url:${state.tabId}`]: state.url });
}

function navigate(raw) {
  const result = parseUrl(raw);
  if (!result.ok) {
    showEmpty(result.error);
    return;
  }
  ui.screen.classList.remove('is-empty');
  ui.screen.classList.add('blank-canvas');
  state.url = result.url;
  state.bridged = false;
  ui.url.value = result.url;
  setLoading(true);
  ui.frame.src = result.url;
  persistUrl();
  updateNavButtons();
}

function setLocation(href, title) {
  if (typeof href !== 'string' || !href) return;
  state.url = href;
  if (document.activeElement !== ui.url) ui.url.value = href;
  document.title = title ? `${title} — Viewport Lab` : 'Viewport Lab';
  persistUrl();
}

function postToFrame(message) {
  ui.frame.contentWindow?.postMessage({ source: 'vplab', ...message }, '*');
}

function sendConfig() {
  postToFrame({ type: 'config', hideScrollbars: currentDevice()?.overlayScrollbars ?? true });
}

// ---------- Free resize ----------

function bindHandles() {
  for (const handle of ui.sizer.querySelectorAll('.handle')) {
    handle.addEventListener('pointerdown', (event) => {
      if (currentDevice() || event.button !== 0) return;
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      const centered = ui.sizer.offsetWidth < ui.stage.clientWidth - STAGE_PAD_X * 2;
      state.drag = {
        axis: handle.dataset.axis,
        x: event.clientX,
        y: event.clientY,
        width: state.prefs.custom.width,
        height: state.prefs.custom.height,
        scale: state.scale,
        // A horizontally centered box grows on both sides, so the edge follows the pointer at 2×.
        factorX: centered ? 2 : 1,
      };
      handle.classList.add('active');
      document.body.classList.add('dragging');
    });

    handle.addEventListener('pointermove', (event) => {
      const drag = state.drag;
      if (!drag) return;
      if (drag.axis.includes('x')) {
        state.prefs.custom.width = clampSize(drag.width + ((event.clientX - drag.x) * drag.factorX) / drag.scale);
      }
      if (drag.axis.includes('y')) {
        state.prefs.custom.height = clampSize(drag.height + (event.clientY - drag.y) / drag.scale);
      }
      render();
    });

    const end = () => {
      if (!state.drag) return;
      state.drag = null;
      handle.classList.remove('active');
      document.body.classList.remove('dragging');
      render();
      savePrefs();
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }
}

// ---------- Events ----------

function applyTypedSize() {
  const width = Number(ui.width.value);
  const height = Number(ui.height.value);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    render();
    return;
  }
  state.prefs.custom = { width: clampSize(width), height: clampSize(height) };
  state.prefs.deviceId = RESPONSIVE_ID;
  state.prefs.landscape = false;
  commit();
}

function rotate() {
  if (currentDevice()) {
    state.prefs.landscape = !state.prefs.landscape;
  } else {
    const { width, height } = state.prefs.custom;
    state.prefs.custom = { width: height, height: width };
  }
  commit();
}

function bindEvents() {
  ui.devices.addEventListener('click', (event) => {
    const id = event.target.closest('.device-btn')?.dataset.id;
    if (!id) return;
    state.prefs.deviceId = id;
    state.prefs.landscape = false;
    commit();
  });

  ui.urlForm.addEventListener('submit', (event) => {
    event.preventDefault();
    navigate(ui.url.value);
    ui.url.blur();
  });
  ui.url.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    ui.url.value = state.url;
    ui.url.blur();
  });
  ui.url.addEventListener('focus', () => ui.url.select());

  for (const input of [ui.width, ui.height]) {
    input.addEventListener('change', applyTypedSize);
    input.addEventListener('focus', () => input.select());
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') input.blur();
    });
  }

  ui.back.addEventListener('click', () => postToFrame({ type: 'nav', action: 'back' }));
  ui.forward.addEventListener('click', () => postToFrame({ type: 'nav', action: 'forward' }));
  ui.reload.addEventListener('click', () => {
    if (!state.url) return;
    setLoading(true);
    if (state.bridged) postToFrame({ type: 'nav', action: 'reload' });
    else ui.frame.src = state.url;
  });
  ui.rotate.addEventListener('click', rotate);
  ui.zoom.addEventListener('change', () => {
    state.prefs.zoom = ui.zoom.value;
    commit();
  });
  ui.bezel.addEventListener('click', () => {
    state.prefs.bezel = !state.prefs.bezel;
    commit();
  });
  ui.theme.addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('vplab:theme', theme);
  });
  ui.exit.addEventListener('click', () => {
    if (state.url) location.assign(state.url);
  });

  ui.frame.addEventListener('load', () => setLoading(false));

  window.addEventListener('message', (event) => {
    if (event.source !== ui.frame.contentWindow || event.data?.source !== 'vplab') return;
    const { type, href, title, blankCanvas } = event.data;
    if (type === 'hello') {
      state.bridged = true;
      setLoading(true);
      sendConfig();
      setLocation(href, '');
    } else if (type === 'location') {
      setLocation(href, title);
      ui.screen.classList.toggle('blank-canvas', Boolean(blankCanvas));
    }
    updateNavButtons();
  });

  window.addEventListener('keydown', (event) => {
    if (event.target.closest?.('input, select, textarea') || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'r' || event.key === 'R') rotate();
  });

  new ResizeObserver(() => render()).observe(ui.stage);
}

async function init() {
  buildDeviceNav();
  bindEvents();
  bindHandles();
  await loadPrefs();
  render();
  settleIndicator();
  document.fonts.ready.then(settleIndicator);

  const tab = await chrome.tabs.getCurrent();
  state.tabId = tab?.id ?? null;
  // The header-stripping rule must exist before the frame requests the page.
  await chrome.runtime.sendMessage({ type: 'register' }).catch((err) => console.error(err));

  const initial = new URLSearchParams(location.search).get('u');
  if (initial) navigate(initial);
  else {
    showEmpty('Digite uma URL para começar.');
    ui.url.focus();
  }
  updateNavButtons();
}

init();
