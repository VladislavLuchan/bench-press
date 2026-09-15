import { api } from '../api/client.ts';
import { DispatchButton } from './DispatchButton.tsx';

/** Triggers the GitHub scrape workflow; disabled while the 20 minute cooldown runs. */
export function FetchNowButton() {
  return (
    <DispatchButton
      label="Fetch now"
      busyLabel="Running…"
      status={api.fetchNow.status}
      trigger={api.fetchNow.trigger}
    />
  );
}
