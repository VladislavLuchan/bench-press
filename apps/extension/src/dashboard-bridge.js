// Content script on the dashboard only. Marks the page so the dashboard knows the extension
// is installed, hands the dashboard token to the extension, and relays messages both ways.
(() => {
  const PAGE_SOURCE = 'bench-press-page';
  const EXTENSION_SOURCE = 'bench-press-extension';
  const TOKEN_KEY = 'bench-press.token';

  document.documentElement.dataset.benchPressExtension = chrome.runtime.getManifest().version;

  function sendConfig() {
    let token = null;
    try {
      token = localStorage.getItem(TOKEN_KEY);
    } catch {
      // Storage blocked: the side panel will ask to open the dashboard again.
    }
    if (token) chrome.runtime.sendMessage({ type: 'config', token }).catch(() => {});
  }
  sendConfig();

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data;
    if (data?.source !== PAGE_SOURCE || data.type !== 'open-job') return;
    // The token may have been entered after this page loaded.
    sendConfig();
    chrome.runtime.sendMessage({ type: 'open-job', job: data.job }).catch(() => {});
  });

  chrome.runtime.onMessage.addListener((message) => {
    window.postMessage({ ...message, source: EXTENSION_SOURCE }, location.origin);
  });
})();
