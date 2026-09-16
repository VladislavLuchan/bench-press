import { useEffect, useRef } from 'react';

const EDITABLE = /^(INPUT|TEXTAREA|SELECT)$/;

function isEditable(element: Element | null): element is HTMLElement {
  return Boolean(
    element && (EDITABLE.test(element.tagName) || (element as HTMLElement).isContentEditable),
  );
}

/**
 * Invisible input that holds keyboard focus whenever no real field has it. Vim browser
 * extensions treat a focused input as insert mode and let every key through to the page,
 * which is how sites like YouTube keep their own shortcuts working. Typing into it is
 * blocked; the global hotkey handler reads the keys instead.
 */
export function KeySink() {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const sink = ref.current;
    if (!sink) return;

    const grab = () => {
      const active = document.activeElement;
      if (active === sink || isEditable(active)) return;
      sink.focus({ preventScroll: true });
    };

    // After any click, focus settles on a button or on the body; take it back unless the
    // user clicked into a field. The timeout lets the browser finish its own focus change.
    const onPointerUp = () => setTimeout(grab, 0);
    // Vim extensions blur the field on Escape. Treat that as our Escape, then re-arm.
    const onBlur = () =>
      setTimeout(() => {
        const active = document.activeElement;
        if (active && active !== document.body && active !== sink) return;
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape' }));
        grab();
      }, 0);

    grab();
    document.addEventListener('pointerup', onPointerUp);
    sink.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('pointerup', onPointerUp);
      sink.removeEventListener('blur', onBlur);
    };
  }, []);

  return (
    <input
      ref={ref}
      className="key-sink"
      data-key-sink
      aria-hidden="true"
      tabIndex={-1}
      autoComplete="off"
      inputMode="none"
      value=""
      onChange={() => undefined}
      onBeforeInput={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (!event.ctrlKey && !event.metaKey && event.key.length === 1) event.preventDefault();
      }}
    />
  );
}
