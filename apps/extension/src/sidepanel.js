// Side panel shown next to an employer page. Everything it does is started by a click:
// copy or fill a saved answer, attach the cover letter, draft an answer to a custom question,
// mark the job. Submitting the application stays with the user.

const PAGE_SCRIPTS = ['src/page/match.js', 'src/page/tools.js'];

const panel = document.getElementById('panel');
const statusLine = document.getElementById('status');

const state = {
  windowId: null,
  /** @type {Array<{id: number, title: string, company: string | null, url: string}>} */
  recent: [],
  linkedJobId: null,
  job: null,
  fields: [],
  letter: '',
  question: '',
  answer: '',
  busy: null,
};

// ---------------------------------------------------------------- helpers

function h(tag, props = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on')) element.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'className') element.className = value;
    else if (key === 'value') element.value = value;
    else element.setAttribute(key, value === true ? '' : value);
  }
  element.append(...children.flat().filter((child) => child !== null && child !== false));
  return element;
}

function button(label, onClick, { primary = false, small = false, disabled = false, title } = {}) {
  const className = ['btn', primary && 'btn--primary', small && 'btn--small']
    .filter(Boolean)
    .join(' ');
  return h('button', { type: 'button', className, onClick, disabled, title }, label);
}

function setStatus(text, tone = '') {
  statusLine.textContent = text;
  statusLine.className = `status ${tone ? `status--${tone}` : ''}`;
}

async function api(path, init = {}) {
  const { config } = await chrome.storage.local.get('config');
  if (!config?.token) {
    throw new Error('Open the dashboard once so the extension can pick up its token.');
  }
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${config.token}`);
  if (init.body) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${config.apiBase}/api${path}`, { ...init, headers });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      message = (await response.json()).error ?? message;
    } catch {
      // Not JSON; keep the status line.
    }
    throw new Error(message);
  }
  return response;
}

/** Runs an action with the button row disabled and errors shown in the status line. */
async function run(label, action) {
  if (state.busy) return;
  state.busy = label;
  render();
  try {
    await action();
  } catch (error) {
    setStatus(error?.message ?? String(error), 'error');
  } finally {
    state.busy = null;
    render();
  }
}

async function copy(text, what) {
  await navigator.clipboard.writeText(text);
  setStatus(`${what} copied`, 'good');
}

// ---------------------------------------------------------------- page actions

async function activeTabId() {
  const [tab] = await chrome.tabs.query({ active: true, windowId: state.windowId });
  if (!tab?.id) throw new Error('No page in this window');
  return tab.id;
}

/** Calls a benchPressTools function in every frame of the current page. */
async function inPage(name, ...args) {
  const target = { tabId: await activeTabId(), allFrames: true };
  try {
    await chrome.scripting.executeScript({ target, files: PAGE_SCRIPTS });
    const results = await chrome.scripting.executeScript({
      target,
      func: (fn, fnArgs) => globalThis.benchPressTools?.[fn]?.(...fnArgs) ?? null,
      args: [name, args],
    });
    return results.map((result) => result.result).filter(Boolean);
  } catch (error) {
    throw new Error(`Cannot reach this page (${error?.message ?? error})`);
  }
}

async function fillFocused(value, what) {
  const results = await inPage('fillFocused', value);
  if (results.some((result) => result.filled)) setStatus(`${what} filled in`, 'good');
  else setStatus('Click into a field on the page first, then press Fill', 'error');
}

async function fillKnown() {
  const results = await inPage('fillKnown', state.fields);
  const filled = results.reduce((sum, result) => sum + result.filled, 0);
  setStatus(
    filled > 0
      ? `Filled ${filled} field${filled === 1 ? '' : 's'}. Check them before you submit.`
      : 'No empty field on this page matched a saved answer',
    filled > 0 ? 'good' : '',
  );
}

// ---------------------------------------------------------------- job actions

async function ensureLetter() {
  if (state.letter.trim() && state.letter !== (state.job.coverLetter ?? '')) {
    // Edited in the panel: store it so the PDF matches what is on screen.
    await updateJob({ coverLetter: state.letter });
  }
  if (state.letter.trim()) return;
  setStatus('Writing the cover letter…');
  const response = await api(`/jobs/${state.job.id}/cover-letter`, {
    method: 'POST',
    body: JSON.stringify({ force: false }),
  });
  const { coverLetter } = await response.json();
  state.letter = coverLetter;
  state.job = { ...state.job, coverLetter };
}

async function fetchPdf() {
  await ensureLetter();
  const response = await api(`/jobs/${state.job.id}/cover-letter.pdf`);
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const encoded = /filename\*=UTF-8''([^;]+)/.exec(disposition)?.[1];
  const name = encoded ? decodeURIComponent(encoded) : 'Cover_Letter.pdf';
  return { name, blob: await response.blob() };
}

async function base64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

async function attachPdf() {
  const { name, blob } = await fetchPdf();
  const results = await inPage('attachFile', {
    name,
    type: 'application/pdf',
    base64: await base64(blob),
  });
  if (results.some((result) => result.attached)) {
    setStatus(`${name} attached. Check the upload before you submit.`, 'good');
    return;
  }
  const inputs = results.reduce((sum, result) => sum + result.inputs, 0);
  download(blob, name);
  setStatus(
    inputs === 0
      ? 'No upload field on this page yet; the PDF was downloaded instead'
      : 'Not sure which upload is for the cover letter; the PDF was downloaded, attach it by hand',
    'error',
  );
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  h('a', { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function updateJob(body) {
  const response = await api(`/jobs/${state.job.id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  const job = await response.json();
  state.job = job;
  // The dashboard updates its list and drops its "Applied?" prompt.
  chrome.runtime.sendMessage({ type: 'job-updated', job }).catch(() => {});
  return job;
}

async function setJobStatus(status) {
  await updateJob({ status });
  setStatus(status === 'applied' ? 'Marked applied' : `Marked ${status}`, 'good');
}

async function draftAnswer() {
  if (!state.question.trim()) throw new Error('Paste the question from the form first');
  setStatus('Drafting…');
  const response = await api(`/jobs/${state.job.id}/answer`, {
    method: 'POST',
    body: JSON.stringify({ question: state.question }),
  });
  state.answer = (await response.json()).answer;
  setStatus('Draft ready. Read it before you paste it.', 'good');
}

// ---------------------------------------------------------------- loading

async function loadJob(id) {
  state.job = null;
  state.letter = '';
  state.answer = '';
  render();
  const response = await api(`/jobs/${id}`);
  state.job = await response.json();
  state.letter = state.job.coverLetter ?? '';
  render();
}

async function loadContext() {
  state.windowId = (await chrome.windows.getCurrent()).id;
  const [{ jobWindows = {} }, { recentJobs = [] }] = await Promise.all([
    chrome.storage.session.get('jobWindows'),
    chrome.storage.local.get('recentJobs'),
  ]);
  state.recent = recentJobs;
  state.linkedJobId = jobWindows[state.windowId]?.id ?? null;
}

async function init() {
  try {
    await loadContext();
    const fieldsResponse = await api('/apply-fields');
    state.fields = (await fieldsResponse.json()).fields;
    const id = state.linkedJobId ?? state.recent[0]?.id;
    if (id) await loadJob(id);
    else render();
  } catch (error) {
    render();
    setStatus(error?.message ?? String(error), 'error');
  }
}

// A job opened from the dashboard while this panel is open.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.recentJobs) state.recent = changes.recentJobs.newValue ?? [];
  if (area === 'session' && changes.jobWindows) {
    const linked = changes.jobWindows.newValue?.[state.windowId]?.id ?? null;
    if (linked && linked !== state.linkedJobId) {
      state.linkedJobId = linked;
      void run('load', () => loadJob(linked));
      return;
    }
  }
  render();
});

// ---------------------------------------------------------------- rendering

function renderPicker() {
  if (state.recent.length === 0) return null;
  const select = h(
    'select',
    {
      className: 'input job__picker',
      title: 'Jobs recently opened from the dashboard',
      onChange: (event) => void run('load', () => loadJob(Number(event.target.value))),
    },
    state.recent.map((job) =>
      h(
        'option',
        { value: String(job.id), selected: job.id === state.job?.id },
        `${job.id === state.linkedJobId ? '● ' : ''}${job.title}${job.company ? ` — ${job.company}` : ''}`,
      ),
    ),
  );
  return select;
}

function renderJob() {
  const { job } = state;
  const busy = state.busy !== null;
  return h(
    'section',
    { className: 'job' },
    renderPicker(),
    h('h1', { className: 'job__title' }, job.title),
    h(
      'p',
      { className: 'job__meta' },
      [job.company ?? 'unknown company', job.fit !== null ? `fit ${job.fit}` : null, job.status]
        .filter(Boolean)
        .join(' · '),
    ),
    h(
      'div',
      { className: 'row' },
      button('✓ Applied', () => run('status', () => setJobStatus('applied')), {
        primary: true,
        disabled: busy || job.status === 'applied',
      }),
      button('Skip', () => run('status', () => setJobStatus('skipped')), {
        disabled: busy || job.status === 'skipped',
      }),
    ),
  );
}

function renderFields() {
  const busy = state.busy !== null;
  return h(
    'section',
    { className: 'section' },
    h('h2', { className: 'section__title' }, 'Your answers'),
    state.fields.length === 0
      ? h(
          'p',
          { className: 'hint' },
          'No saved answers yet. Add "Label: value" lines under Settings → Application form answers.',
        )
      : [
          h(
            'div',
            { className: 'row' },
            button('Fill matching fields', () => run('fill', fillKnown), {
              primary: true,
              disabled: busy,
              title: 'Fills empty fields whose label matches a saved answer. Never submits.',
            }),
          ),
          h(
            'ul',
            { className: 'fields' },
            state.fields.map((field) =>
              h(
                'li',
                { className: 'field' },
                h('span', { className: 'field__label' }, field.label),
                h('span', { className: 'field__value', title: field.value }, field.value),
                h(
                  'span',
                  { className: 'field__actions' },
                  button('Copy', () => run('copy', () => copy(field.value, field.label)), {
                    small: true,
                  }),
                  button('Fill', () => run('fill', () => fillFocused(field.value, field.label)), {
                    small: true,
                    title: 'Into the field you clicked last on the page',
                  }),
                ),
              ),
            ),
          ),
        ],
  );
}

function renderLetter() {
  const busy = state.busy !== null;
  const hasLetter = Boolean(state.letter.trim());
  return h(
    'section',
    { className: 'section' },
    h('h2', { className: 'section__title' }, 'Cover letter'),
    h('textarea', {
      className: 'input',
      rows: 8,
      placeholder: 'No letter yet. Attach or Generate writes one.',
      value: state.letter,
      onInput: (event) => {
        state.letter = event.target.value;
      },
    }),
    h(
      'div',
      { className: 'row' },
      button(
        state.busy === 'attach' ? 'Attaching…' : 'Attach PDF',
        () => run('attach', attachPdf),
        {
          primary: true,
          disabled: busy,
          title: "Puts the PDF into the page's cover letter upload",
        },
      ),
      button(
        'Download PDF',
        () =>
          run('pdf', async () => {
            const { name, blob } = await fetchPdf();
            download(blob, name);
            setStatus(`${name} downloaded`, 'good');
          }),
        { disabled: busy },
      ),
      button('Copy', () => run('copy', () => copy(state.letter, 'Cover letter')), {
        disabled: busy || !hasLetter,
      }),
      button('Fill', () => run('fill', () => fillFocused(state.letter, 'Cover letter')), {
        disabled: busy || !hasLetter,
        title: 'Into the text field you clicked last on the page',
      }),
      hasLetter
        ? null
        : button('Generate', () => run('generate', ensureLetter), { disabled: busy }),
    ),
  );
}

function renderQuestion() {
  const busy = state.busy !== null;
  return h(
    'section',
    { className: 'section' },
    h('h2', { className: 'section__title' }, 'Question from the form'),
    h('textarea', {
      className: 'input',
      rows: 3,
      placeholder: 'Paste a question, e.g. "Why do you want to join us?"',
      value: state.question,
      onInput: (event) => {
        state.question = event.target.value;
      },
    }),
    h(
      'div',
      { className: 'row' },
      button(
        state.busy === 'answer' ? 'Drafting…' : 'Draft answer',
        () => run('answer', draftAnswer),
        {
          disabled: busy,
        },
      ),
    ),
    state.answer
      ? [
          h('textarea', {
            className: 'input',
            rows: 6,
            value: state.answer,
            onInput: (event) => {
              state.answer = event.target.value;
            },
          }),
          h(
            'div',
            { className: 'row' },
            button('Copy', () => run('copy', () => copy(state.answer, 'Answer')), {
              disabled: busy,
            }),
            button('Fill', () => run('fill', () => fillFocused(state.answer, 'Answer')), {
              disabled: busy,
              title: 'Into the text field you clicked last on the page',
            }),
          ),
        ]
      : null,
  );
}

function render() {
  // Keep typing position: re-rendering replaces the textareas.
  const focused = document.activeElement;
  const focusIndex = [...panel.querySelectorAll('textarea')].indexOf(focused);

  if (!state.job) {
    panel.replaceChildren(
      renderPicker() ?? '',
      h(
        'p',
        { className: 'panel__empty' },
        state.recent.length === 0
          ? 'Open a job from the dashboard: it opens in its own window with this panel beside it.'
          : 'Loading the job…',
      ),
    );
    return;
  }
  panel.replaceChildren(renderJob(), renderFields(), renderLetter(), renderQuestion());
  if (focusIndex >= 0) panel.querySelectorAll('textarea')[focusIndex]?.focus();
}

void init();
