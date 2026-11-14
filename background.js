const VIEWER_URL = chrome.runtime.getURL('viewer.html');
const FRAME_RULE_ID = 1;
const NO_CACHE_RULE_ID = 2;
const TABS_KEY = 'viewerTabs';
const urlKey = (tabId) => `url:${tabId}`;

// Session storage + session rules survive service-worker restarts; all mutations go through one queue.
let queue = Promise.resolve();
const serial = (task) => (queue = queue.then(task).catch((err) => console.error(err)));

async function readTabs() {
  const { [TABS_KEY]: tabs = [] } = await chrome.storage.session.get(TABS_KEY);
  return tabs;
}

// Inside viewer tabs only: strip framing protections from sub-frames, and make every request
// (page, CSS, JS, images) skip Chrome's HTTP cache so the framed site always shows the current deploy.
async function writeTabs(tabs) {
  await chrome.storage.session.set({ [TABS_KEY]: tabs });
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [FRAME_RULE_ID, NO_CACHE_RULE_ID],
    addRules: tabs.length
      ? [
          {
            id: FRAME_RULE_ID,
            priority: 1,
            action: {
              type: 'modifyHeaders',
              responseHeaders: [
                { header: 'x-frame-options', operation: 'remove' },
                { header: 'content-security-policy', operation: 'remove' },
              ],
            },
            condition: { tabIds: tabs, resourceTypes: ['sub_frame'] },
          },
          {
            id: NO_CACHE_RULE_ID,
            priority: 1,
            action: {
              type: 'modifyHeaders',
              requestHeaders: [
                { header: 'cache-control', operation: 'set', value: 'no-cache' },
                { header: 'pragma', operation: 'set', value: 'no-cache' },
              ],
              responseHeaders: [{ header: 'cache-control', operation: 'set', value: 'no-store' }],
            },
            condition: { tabIds: tabs },
          },
        ]
      : [],
  });
}

const addTab = (tabId) =>
  serial(async () => {
    const tabs = await readTabs();
    if (!tabs.includes(tabId)) await writeTabs([...tabs, tabId]);
  });

const removeTab = (tabId) =>
  serial(async () => {
    const tabs = await readTabs();
    if (!tabs.includes(tabId)) return;
    await writeTabs(tabs.filter((id) => id !== tabId));
    await chrome.storage.session.remove(urlKey(tabId));
  });

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'register' || sender.tab?.id === undefined) return false;
  addTab(sender.tab.id).then(() => sendResponse({ ok: true }));
  return true;
});

// Toggle: site → viewer with that URL; viewer → back to the page currently shown in it.
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id === undefined) return;
  if ((await readTabs()).includes(tab.id)) {
    const key = urlKey(tab.id);
    const { [key]: url } = await chrome.storage.session.get(key);
    if (url) await chrome.tabs.update(tab.id, { url });
    return;
  }
  const query = /^(https?|file):/.test(tab.url ?? '') ? `?u=${encodeURIComponent(tab.url)}` : '';
  await chrome.tabs.update(tab.id, { url: VIEWER_URL + query });
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === 'loading' && !tab.url?.startsWith(VIEWER_URL)) removeTab(tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => removeTab(tabId));
