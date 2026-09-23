// Service worker: opens jobs in normal windows, remembers which window belongs to which job,
// and relays status changes back to the dashboard. It never touches employer pages itself.

const DASHBOARD_ORIGIN = new URL(chrome.runtime.getManifest().content_scripts[0].matches[0])
  .origin;
const RECENT_LIMIT = 10;

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

/** @returns {Promise<Record<string, {id: number, title: string, company: string | null, url: string}>>} */
async function jobWindows() {
  const { jobWindows: map = {} } = await chrome.storage.session.get('jobWindows');
  return map;
}

async function notifyDashboards(message) {
  const tabs = await chrome.tabs.query({ url: `${DASHBOARD_ORIGIN}/*` });
  await Promise.all(
    tabs.map((tab) => (tab.id ? chrome.tabs.sendMessage(tab.id, message).catch(() => {}) : null)),
  );
}

async function openJob(job) {
  // A normal window has tabs, so an "Apply" link that opens the employer site in a new tab
  // stays in this window instead of jumping to the main browser window.
  const win = await chrome.windows.create({ url: job.url, type: 'normal', focused: true });
  // Opening the panel needs a user gesture; the click in the dashboard usually still counts.
  // When it does not, the toolbar icon or Alt+Shift+B opens it.
  chrome.sidePanel.open({ windowId: win.id }).catch(() => {});

  const map = await jobWindows();
  map[win.id] = job;
  const { recentJobs = [] } = await chrome.storage.local.get('recentJobs');
  await Promise.all([
    chrome.storage.session.set({ jobWindows: map }),
    chrome.storage.local.set({
      recentJobs: [job, ...recentJobs.filter((item) => item.id !== job.id)].slice(0, RECENT_LIMIT),
    }),
  ]);
  return { windowId: win.id };
}

function isValidJob(job) {
  return (
    job &&
    Number.isInteger(job.id) &&
    typeof job.title === 'string' &&
    typeof job.url === 'string' &&
    /^https?:\/\//.test(job.url)
  );
}

async function handle(message, sender) {
  const fromDashboard = sender.url?.startsWith(`${DASHBOARD_ORIGIN}/`) ?? false;
  const fromExtension = sender.id === chrome.runtime.id && !sender.tab;

  if (message?.type === 'config' && fromDashboard) {
    if (typeof message.token !== 'string' || !message.token) return { error: 'no token' };
    await chrome.storage.local.set({ config: { apiBase: DASHBOARD_ORIGIN, token: message.token } });
    return { ok: true };
  }
  if (message?.type === 'open-job' && fromDashboard) {
    if (!isValidJob(message.job)) return { error: 'invalid job' };
    const { id, title, company, url } = message.job;
    return openJob({ id, title, company: company ?? null, url });
  }
  if (message?.type === 'job-updated' && fromExtension) {
    await notifyDashboards({ type: 'job-updated', job: message.job });
    return { ok: true };
  }
  return { error: 'unknown message' };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handle(message, sender).then(sendResponse, (error) =>
    sendResponse({ error: String(error?.message ?? error) }),
  );
  return true;
});

chrome.windows.onRemoved.addListener(async (windowId) => {
  const map = await jobWindows();
  const job = map[windowId];
  if (!job) return;
  delete map[windowId];
  await chrome.storage.session.set({ jobWindows: map });
  // The dashboard highlights its "Applied?" prompt for this job.
  await notifyDashboards({ type: 'job-window-closed', jobId: job.id });
});
