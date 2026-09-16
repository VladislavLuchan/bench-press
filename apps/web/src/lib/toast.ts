import { useEffect, useState } from 'react';

export interface Toast {
  id: number;
  tone: 'error' | 'info';
  text: string;
}

const TOAST_EVENT = 'bench-press:toast';
let nextId = 1;

/** Fire-and-forget notification; rendered by <Toasts /> in the app shell. */
export function toast(text: string, tone: Toast['tone'] = 'info'): void {
  window.dispatchEvent(new CustomEvent<Toast>(TOAST_EVENT, { detail: { id: nextId++, tone, text } }));
}

export function toastError(text: string): void {
  toast(text, 'error');
}

export function useToasts(ttlMs = 6000): Toast[] {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => {
    const onToast = (event: Event) => {
      const item = (event as CustomEvent<Toast>).detail;
      setToasts((current) => [...current, item]);
      setTimeout(() => setToasts((current) => current.filter((t) => t.id !== item.id)), ttlMs);
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, [ttlMs]);
  return toasts;
}
