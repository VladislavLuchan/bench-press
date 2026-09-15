import { useEffect } from 'react';

export interface Hotkey {
  /** `event.key` value, e.g. 'j', 'Enter', 'Escape', '?'. */
  key: string;
  description: string;
  action: (event: KeyboardEvent) => void;
}

const EDITABLE = /^(INPUT|TEXTAREA|SELECT)$/;

/** Global single-key shortcuts; ignored while typing in a form field. */
export function useHotkeys(hotkeys: Hotkey[], enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (EDITABLE.test(target.tagName) || target.isContentEditable)) {
        if (event.key !== 'Escape') return;
        target.blur();
      }
      const hotkey = hotkeys.find((item) => item.key === event.key);
      if (!hotkey) return;
      event.preventDefault();
      hotkey.action(event);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hotkeys, enabled]);
}

/** Custom event that lets a keyboard shortcut reach a component that owns the action. */
export const HOTKEY_ACTION_EVENT = 'bench-press:hotkey';

export function emitHotkeyAction(action: string): void {
  window.dispatchEvent(new CustomEvent(HOTKEY_ACTION_EVENT, { detail: action }));
}

export function useHotkeyAction(action: string, handler: () => void): void {
  useEffect(() => {
    const onAction = (event: Event) => {
      if ((event as CustomEvent<string>).detail === action) handler();
    };
    window.addEventListener(HOTKEY_ACTION_EVENT, onAction);
    return () => window.removeEventListener(HOTKEY_ACTION_EVENT, onAction);
  }, [action, handler]);
}
