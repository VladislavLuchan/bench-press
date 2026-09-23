// DOM helpers injected into the employer page (every frame) when the user presses a button in
// the side panel. They only write into form fields and file inputs the user can see and then
// submit themselves: nothing here clicks buttons, submits forms or navigates.
(() => {
  if (globalThis.benchPressTools) return;
  const match = globalThis.benchPressMatch;

  const TEXT_TYPES = new Set(['', 'text', 'email', 'tel', 'url', 'number', 'search']);
  const FLASH_MS = 1200;
  // The dashboard accent. Employer pages cannot see the dashboard's CSS tokens.
  const FLASH_COLOR = '#7aa2f7'; // claude-allow-hex

  function isFillable(element) {
    if (element instanceof HTMLTextAreaElement) return !element.disabled && !element.readOnly;
    if (element instanceof HTMLInputElement) {
      return TEXT_TYPES.has(element.type) && !element.disabled && !element.readOnly;
    }
    return element instanceof HTMLElement && element.isContentEditable;
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden';
  }

  function text(element) {
    return element?.innerText?.trim() ?? '';
  }

  /** What the page says about a field, most trusted first (see match.kindOfField). */
  function describe(element) {
    const parts = [];
    for (const label of element.labels ?? []) parts.push(text(label));
    for (const id of (element.getAttribute('aria-labelledby') ?? '').split(/\s+/)) {
      if (id) parts.push(text(document.getElementById(id)));
    }
    parts.push(element.getAttribute('aria-label') ?? '');
    if (parts.every((part) => !part)) {
      // Forms built from divs: take the label-like text of the nearest field wrapper.
      const wrapper = element.closest(
        '[class*="field" i], [class*="question" i], [class*="form-group" i], fieldset, li',
      );
      parts.push(text(wrapper?.querySelector('label, legend, [class*="label" i]')));
    }
    parts.push(
      element.getAttribute('placeholder') ?? '',
      element.getAttribute('name') ?? '',
      element.id ?? '',
    );
    return parts.filter(Boolean);
  }

  function flash(element) {
    const previous = element.style.outline;
    element.style.outline = `2px solid ${FLASH_COLOR}`;
    setTimeout(() => {
      element.style.outline = previous;
    }, FLASH_MS);
  }

  function announce(element) {
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    flash(element);
  }

  /** Sets the value the way typing does, so React and Vue forms register the change. */
  function setValue(element, value) {
    element.focus();
    if (element.isContentEditable) {
      document.execCommand('insertText', false, value);
      flash(element);
      return;
    }
    const proto =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value);
    announce(element);
  }

  /** Inserts at the cursor when the field already has text, otherwise fills it. */
  function insertValue(element, value) {
    if (element.isContentEditable || !element.value) {
      setValue(element, value);
      return;
    }
    try {
      element.setRangeText(value, element.selectionStart, element.selectionEnd, 'end');
      announce(element);
    } catch {
      // email and number inputs have no selection API.
      setValue(element, value);
    }
  }

  function focusedField() {
    const element = document.activeElement;
    return element && !(element instanceof HTMLIFrameElement) && isFillable(element)
      ? element
      : null;
  }

  function pickUpload(inputs) {
    const kinds = inputs.map((input) => match.uploadKind(describe(input)));
    const labelled = inputs.filter((_, index) => kinds[index] === 'cover_letter');
    if (labelled.length === 1) return labelled[0];
    const unlabelled = inputs.filter((_, index) => kinds[index] === null);
    return labelled.length === 0 && unlabelled.length === 1 ? unlabelled[0] : null;
  }

  globalThis.benchPressTools = {
    /** Puts text into the field the user clicked last in this frame. */
    fillFocused(value) {
      const element = focusedField();
      if (!element) return { filled: false };
      insertValue(element, value);
      return { filled: true };
    },

    /** Fills every visible, empty field whose label matches a saved answer. */
    fillKnown(fields) {
      let filled = 0;
      for (const element of document.querySelectorAll('input, textarea')) {
        if (!isFillable(element) || !isVisible(element) || element.value.trim()) continue;
        const value = match.valueForField(
          describe(element),
          element.type,
          element.getAttribute('autocomplete'),
          fields,
        );
        if (!value) continue;
        setValue(element, value);
        filled += 1;
      }
      return { filled };
    },

    /**
     * Puts the cover letter PDF into the page's cover letter upload. A single unlabelled file
     * input also qualifies; a resume/CV input never does, and with several candidates nothing
     * happens, so the user attaches the downloaded file by hand.
     */
    attachFile(file) {
      const inputs = [...document.querySelectorAll('input[type="file"]')].filter(
        (input) => !input.disabled,
      );
      const target = pickUpload(inputs);
      if (!target) return { attached: false, inputs: inputs.length };

      const bytes = Uint8Array.from(atob(file.base64), (char) => char.charCodeAt(0));
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], file.name, { type: file.type }));
      target.files = transfer.files;
      // File inputs usually hide behind a styled drop zone; flash what is visible.
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
      const visible = isVisible(target) ? target : target.closest('label, div');
      if (visible) flash(visible);
      return { attached: true, inputs: inputs.length };
    },
  };
})();
