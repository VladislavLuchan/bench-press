import { useEffect } from 'react';

/**
 * A key combo: 'j', 'alt+j', 'ArrowDown', 'alt+shift+1', 'shift+/', 'Enter'. Letters,
 * digits and punctuation are matched by physical key (`event.code`), so the shortcuts work
 * in any keyboard layout: the J key is `j` whether the layout prints j or о on it.
 */
export interface Hotkey {
  keys: string[];
  description: string;
  action: (event: KeyboardEvent) => void;
}

const EDITABLE = /^(INPUT|TEXTAREA|SELECT)$/;

const PUNCTUATION_CODES: Record<string, string> = {
  Slash: '/',
  Period: '.',
  Comma: ',',
  Minus: '-',
  Equal: '=',
  Space: 'Space',
};

function physicalKey(event: KeyboardEvent): string {
  const letter = /^Key([A-Z])$/.exec(event.code);
  if (letter) return letter[1]!.toLowerCase();
  const digit = /^(?:Digit|Numpad)(\d)$/.exec(event.code);
  if (digit) return digit[1]!;
  return PUNCTUATION_CODES[event.code] ?? event.key;
}

export function comboOf(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.altKey) parts.push('alt');
  if (event.ctrlKey) parts.push('ctrl');
  if (event.shiftKey) parts.push('shift');
  parts.push(physicalKey(event));
  return parts.join('+');
}

/**
 * Global shortcuts. Every action has a plain-key binding and an Alt binding. Vim extensions
 * grab plain letters first; Vimium users add this site under "Excluded URLs and keys" with
 * the letters listed in the help panel, so those keys reach the page while the rest of
 * Vimium keeps working. Plain keys are ignored while typing in a form field; Alt combos
 * work everywhere.
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
