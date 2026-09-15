import { useState } from 'react';
import type { Job } from '@bench-press/shared/types';
import { api, errorMessage } from '../api/client.ts';
import { useClipboard } from '../hooks/useClipboard.ts';

interface Props {
  job: Job;
  onJobChange: (job: Job) => void;
}

const STATUS_TEXT = {
  idle: '',
  copied: 'Copied to clipboard',
  pending: 'Will copy when you return to this tab',
  failed: 'Clipboard blocked. Use the Copy button',
} as const;

/**
 * One click does everything: opens the job (synchronously, so the popup is not blocked),
 * generates the letter if needed, then copies it. The letter stays editable here.
 * Mounted with key={job.id} so local state resets when another job is selected.
 */
export function CoverLetterPanel({ job, onJobChange }: Props) {
  const [text, setText] = useState(job.coverLetter ?? '');
  const [busy, setBusy] = useState<'generate' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clipboard = useClipboard();

  const dirty = text !== (job.coverLetter ?? '');

  const generate = async (force: boolean): Promise<string> => {
    setBusy('generate');
    setError(null);
    try {
      const result = await api.jobs.coverLetter(job.id, force);
      setText(result.coverLetter);
      onJobChange({ ...job, coverLetter: result.coverLetter, coverLetterLang: result.lang });
      return result.coverLetter;
    } finally {
      setBusy(null);
    }
  };

  const handleCopyAndOpen = () => {
    window.open(job.url, '_blank', 'noopener,noreferrer');
    const run = text ? Promise.resolve(text) : generate(false);
    run.then((letter) => clipboard.copy(letter)).catch((err: unknown) => setError(errorMessage(err)));
  };

  const handleRegenerate = () => {
    generate(true).catch((err: unknown) => setError(errorMessage(err)));
  };

  const handleSave = async () => {
    setBusy('save');
    setError(null);
    try {
      onJobChange(await api.jobs.update(job.id, { coverLetter: text }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="cover-letter">
      <div className="cover-letter__actions">
        <button
          className="btn btn--primary"
          type="button"
          disabled={busy !== null}
          onClick={handleCopyAndOpen}
        >
          {busy === 'generate' ? 'Generating…' : 'Copy cover letter & open'}
        </button>
        <button
          className="btn"
          type="button"
          disabled={!text}
          onClick={() => void clipboard.copy(text)}
        >
          Copy
        </button>
        <button className="btn" type="button" disabled={!dirty || busy !== null} onClick={handleSave}>
          {busy === 'save' ? 'Saving…' : 'Save edits'}
        </button>
        <button
          className="btn btn--ghost"
          type="button"
          disabled={!job.coverLetter || busy !== null}
          onClick={handleRegenerate}
        >
          Regenerate
        </button>
        <span className={`cover-letter__status cover-letter__status--${clipboard.status}`}>
          {STATUS_TEXT[clipboard.status]}
        </span>
      </div>
      {error && <p className="cover-letter__error">{error}</p>}
      <textarea
        className="cover-letter__text"
        rows={12}
        placeholder="No cover letter yet. The first click generates one."
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
    </section>
  );
}
