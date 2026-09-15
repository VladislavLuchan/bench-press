import { useCallback, useEffect, useRef, useState } from 'react';

export type ClipboardStatus = 'idle' | 'copied' | 'pending' | 'failed';

/**
 * Clipboard writes fail when the tab has just lost focus (for example right after
 * window.open). A failed write is kept as pending and retried as soon as the tab is
 * focused again, so "open the job, then come back" still ends with the text copied.
 */
export function useClipboard() {
  const [status, setStatus] = useState<ClipboardStatus>('idle');
  const pending = useRef<string | null>(null);

  const copy = useCallback(async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
      pending.current = null;
      setStatus('copied');
      return true;
    } catch {
      pending.current = text;
      setStatus(document.hasFocus() ? 'failed' : 'pending');
      return false;
    }
  }, []);

  useEffect(() => {
    const retry = () => {
      if (pending.current && document.visibilityState === 'visible') void copy(pending.current);
    };
    window.addEventListener('focus', retry);
    document.addEventListener('visibilitychange', retry);
    return () => {
      window.removeEventListener('focus', retry);
      document.removeEventListener('visibilitychange', retry);
    };
  }, [copy]);

  const reset = useCallback(() => {
    pending.current = null;
    setStatus('idle');
  }, []);

  return { status, copy, reset };
}
