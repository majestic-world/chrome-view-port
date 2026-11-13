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

  let last = '';
  const report = () => {
    const current = `${location.href}\n${document.title}`;
    if (current === last) return;
    last = current;
    post({ type: 'location', href: location.href, title: document.title });
  };

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || event.origin !== viewerOrigin) return;
    const data = event.data;
    if (data?.source !== 'vplab') return;
    if (data.type === 'config') setOverlayScrollbars(Boolean(data.hideScrollbars));
    else if (data.type === 'nav') {
      if (data.action === 'back') history.back();
      else if (data.action === 'forward') history.forward();
      else if (data.action === 'reload') location.reload();
    }
  });

  window.addEventListener('popstate', report);
  window.addEventListener('hashchange', report);
  document.addEventListener('DOMContentLoaded', report);
  setInterval(report, 500);
  post({ type: 'hello', href: location.href });
})();
