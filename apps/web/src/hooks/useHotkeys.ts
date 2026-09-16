import { useEffect } from 'react';

/**
 * A key combo: 'j', 'alt+j', 'ArrowDown', 'alt+shift+1', 'Enter'. Letters are matched
 * case-insensitively; digits are matched by physical key so Shift does not turn 1 into !.
 */
export interface Hotkey {
  keys: string[];
  description: string;
  action: (event: KeyboardEvent) => void;
}

const EDITABLE = /^(INPUT|TEXTAREA|SELECT)$/;

export function comboOf(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.altKey) parts.push('alt');
  if (event.ctrlKey) parts.push('ctrl');
  if (event.shiftKey && event.key.length > 1) parts.push('shift');
  let key = event.key;
  if (/^Digit\d$/.test(event.code)) {
    key = event.code.slice(-1);
    if (event.shiftKey) parts.push('shift');
  } else if (key.length === 1) {
    key = key.toLowerCase();
    if (event.shiftKey && event.altKey && /[a-z]/.test(key)) parts.push('shift');
  }
  parts.push(key);
  return parts.join('+');
}

/**
 * Global shortcuts. Every action has a plain-key binding for browsers without a vim
 * extension and an Alt binding that extensions such as Vimium leave alone. Plain keys are
 * ignored while typing in a form field; Alt combos work everywhere.
 */
export function useHotkeys(hotkeys: Hotkey[], enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey) return;
      const combo = comboOf(event);
      const target = event.target as HTMLElement | null;
      const typing = Boolean(target && (EDITABLE.test(target.tagName) || target.isContentEditable));
      if (typing && !event.altKey) {
        if (event.key === 'Escape') target?.blur();
        return;
      }
      const hotkey = hotkeys.find((item) => item.keys.includes(combo));
      if (!hotkey) return;
      event.preventDefault();
      event.stopPropagation();
      hotkey.action(event);
    };
    // Capture phase so the page sees the key before any extension listening on the document.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
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
