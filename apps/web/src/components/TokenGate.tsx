import { useState, type FormEvent } from 'react';
import { tokenStore } from '../api/client.ts';

interface Props {
  onSubmit: () => void;
}

/** Asks for the dashboard token once and keeps it in localStorage. */
export function TokenGate({ onSubmit }: Props) {
  const [value, setValue] = useState('');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const token = value.trim();
    if (!token) return;
    tokenStore.set(token);
    onSubmit();
  };

  return (
    <form className="token-gate" onSubmit={handleSubmit}>
      <h1 className="token-gate__title">bench-press</h1>
      <label className="field">
        <span className="field__label">Dashboard token</span>
        <input
          className="field__input"
          type="password"
          autoComplete="current-password"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoFocus
        />
      </label>
      <button className="btn btn--primary" type="submit">
        Enter
      </button>
    </form>
  );
}
