import { useState } from 'react';
import { api, errorMessage, type ExportOptions, type JobsQuery } from '../api/client.ts';
import { useClipboard } from '../hooks/useClipboard.ts';
import { toast, toastError } from '../lib/toast.ts';

interface Props {
  scope: ExportOptions['scope'];
  /** Current list filters; the export returns exactly what the list shows, up to 1000 jobs. */
  query?: JobsQuery;
}

function download(text: string, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Copy the current list as Markdown for an LLM, or download it as Markdown or JSONL. */
export function ExportMenu({ scope, query }: Props) {
  const [description, setDescription] = useState(false);
  const [busy, setBusy] = useState(false);
  const clipboard = useClipboard();

  const run = async (format: ExportOptions['format'], target: 'clipboard' | 'file') => {
    setBusy(true);
    try {
      const file = await api.export({ scope, format, description, query });
      if (target === 'clipboard') {
        const copied = await clipboard.copy(file.text);
        const size = `${Math.round(file.text.length / 1000)}k characters`;
        if (copied) toast(`Copied ${size} for the LLM`);
        else toastError('Clipboard blocked; use the .md download instead');
      } else {
        download(file.text, file.filename, format === 'md' ? 'text/markdown' : 'application/x-ndjson');
      }
    } catch (err) {
      toastError(`Export failed: ${errorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="export">
      <span className="export__label">Export</span>
      <button
        type="button"
        className="btn btn--small"
        disabled={busy}
        title="Copy as Markdown, ready to paste into an LLM"
        onClick={() => void run('md', 'clipboard')}
      >
        {busy ? 'Exporting…' : 'Copy for LLM'}
      </button>
      <button type="button" className="btn btn--ghost btn--small" disabled={busy} onClick={() => void run('md', 'file')}>
        .md
      </button>
      <button type="button" className="btn btn--ghost btn--small" disabled={busy} onClick={() => void run('jsonl', 'file')}>
        .jsonl
      </button>
      <label className="export__option" title="Full job descriptions make the export several times larger">
        <input type="checkbox" checked={description} onChange={(event) => setDescription(event.target.checked)} />
        with descriptions
      </label>
    </div>
  );
}
