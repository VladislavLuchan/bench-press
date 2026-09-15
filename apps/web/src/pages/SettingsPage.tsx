import { useEffect, useState } from 'react';
import { api, errorMessage, type Settings } from '../api/client.ts';
import { DispatchButton } from '../components/DispatchButton.tsx';

const FIELDS: Array<{ key: keyof Settings; label: string; hint: string }> = [
  {
    key: 'profile',
    label: 'Profile (CV)',
    hint: 'Markdown. Used by the scorer and the cover letter writer. Stored only in the database.',
  },
  {
    key: 'scoring_guidance',
    label: 'Scoring guidance',
    hint: 'Optional notes for the scorer: what to reward, what to punish, salary expectations.',
  },
  {
    key: 'cover_letter_template',
    label: 'Cover letter template',
    hint: 'Your constant paragraph plus the variable blocks the model should fill in.',
  },
];

export function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    api.settings
      .get()
      .then((result) => {
        setSettings(result);
        setDraft(result);
      })
      .catch((err: unknown) => setStatus(errorMessage(err)));
  }, []);

  if (!draft || !settings) return <p className="stats__empty">{status ?? 'Loading…'}</p>;

  const dirty = FIELDS.some(({ key }) => draft[key] !== settings[key]);

  const save = async () => {
    setStatus('Saving…');
    try {
      const saved = await api.settings.update(
        Object.fromEntries(FIELDS.map(({ key }) => [key, draft[key]])),
      );
      setSettings(saved);
      setDraft(saved);
      setStatus('Saved');
    } catch (err) {
      setStatus(errorMessage(err));
    }
  };

  return (
    <div className="settings">
      {FIELDS.map(({ key, label, hint }) => (
        <label key={key} className="field">
          <span className="field__label">{label}</span>
          <span className="field__hint">{hint}</span>
          <textarea
            className="field__input settings__textarea"
            rows={key === 'scoring_guidance' ? 6 : 16}
            value={draft[key]}
            onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
          />
        </label>
      ))}
      <div className="settings__actions">
        <button
          className="btn btn--primary"
          type="button"
          disabled={!dirty}
          onClick={() => void save()}
        >
          Save
        </button>
        {status && <span className="settings__status">{status}</span>}
      </div>
    </div>
  );
}
