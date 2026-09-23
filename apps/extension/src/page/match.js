// Matches form fields on an employer page to the user's saved answers. Pure functions, no
// DOM access, so they are unit tested. Injected as a classic script together with tools.js,
// possibly many times into the same page, hence the guard.
(() => {
  if (globalThis.benchPressMatch) return;

  // JS \b only sees Latin letters, so Cyrillic alternatives use anchors or plain stems.
  const APOSTROPHE = "['’ʼ]?";
  /** Kinds of field, most specific first: "first name" must win over a bare "name". */
  const KINDS = [
    ['first_name', new RegExp(`\\b(first|given|fore) ?name\\b|^fname$|^ім${APOSTROPHE}я$`)],
    ['last_name', /\b(last|family|sur) ?name\b|^lname$|прізвищ/],
    ['full_name', new RegExp(`\\bfull ?name\\b|^(your )?name$|^legal name$|повне ім${APOSTROPHE}я|^піб$`)],
    ['email', /\be ?mail\b|пошт/],
    ['phone', /\b(phone|mobile|tel|telephone|whatsapp)\b|телефон/],
    ['linkedin', /\blinked ?in\b/],
    ['github', /\bgit ?hub\b/],
    ['portfolio', /\b(portfolio|website|personal (site|page|website)|blog)\b|^url$|сайт/],
    ['country', /\bcountry\b|країна/],
    ['location', /\b(city|location|based|address|residence)\b|місто|локаці/],
    ['salary', /\b(salary|compensation|expected (pay|rate)|rate expectations?|desired pay)\b|зарплат/],
    ['notice', /\b(notice period|start date|availability|available to start|when can you start)\b/],
    ['english', /\benglish\b|англійськ/],
  ];

  /** Standard `autocomplete` tokens that name a kind directly. */
  const AUTOCOMPLETE = {
    'given-name': 'first_name',
    'family-name': 'last_name',
    name: 'full_name',
    email: 'email',
    tel: 'phone',
    'tel-national': 'phone',
    country: 'country',
    'country-name': 'country',
    'address-level2': 'location',
  };

  /**
   * Lowercase, accents off Latin letters, punctuation and underscores to spaces:
   * "First_Name *" → "first name", "Résumé" → "resume". Cyrillic й and ї stay whole.
   */
  function normalize(text) {
    return String(text ?? '')
      .normalize('NFKD')
      .replace(/(\p{Script=Latin})\p{M}+/gu, '$1')
      .normalize('NFC')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}'’ʼ]+/gu, ' ')
      .trim();
  }

  function kindOf(text) {
    const value = normalize(text);
    if (!value) return null;
    for (const [kind, pattern] of KINDS) if (pattern.test(value)) return kind;
    return null;
  }

  /**
   * The kind of a page field. `parts` are its descriptions in order of trust: label text,
   * aria-label, placeholder, then name and id attributes. The first part that says anything
   * decides, so a placeholder like "name@example.com" cannot outvote the label "Email".
   */
  function kindOfField(parts, inputType, autocomplete) {
    if (inputType === 'email') return 'email';
    if (inputType === 'tel') return 'phone';
    const token = String(autocomplete ?? '').trim().split(/\s+/).pop();
    if (token && AUTOCOMPLETE[token]) return AUTOCOMPLETE[token];
    for (const part of parts) {
      const kind = kindOf(part);
      if (kind) return kind;
    }
    return null;
  }

  function savedValue(kind, fields) {
    return fields.find((field) => kindOf(field.label) === kind)?.value ?? null;
  }

  /** A saved value of this kind, or one composed from the name parts that were saved. */
  function valueOfKind(kind, fields) {
    const direct = savedValue(kind, fields);
    if (direct) return direct;
    if (kind === 'full_name') {
      const first = savedValue('first_name', fields);
      const last = savedValue('last_name', fields);
      return first && last ? `${first} ${last}` : null;
    }
    const [firstWord, ...rest] = (savedValue('full_name', fields) ?? '').split(/\s+/).filter(Boolean);
    if (kind === 'first_name') return firstWord ?? null;
    if (kind === 'last_name') return rest.length > 0 ? rest.join(' ') : null;
    return null;
  }

  /**
   * The saved value for a page field, or null. A page label equal to a saved label wins
   * (custom questions saved word for word); otherwise both sides are reduced to a kind.
   */
  function valueForField(parts, inputType, autocomplete, fields) {
    const normalizedParts = parts.map(normalize).filter(Boolean);
    const exact = fields.find((field) => normalizedParts.includes(normalize(field.label)));
    if (exact) return exact.value;
    const kind = kindOfField(parts, inputType, autocomplete);
    return kind ? valueOfKind(kind, fields) : null;
  }

  /** Upload fields: where the cover letter goes and where it must not. */
  function uploadKind(parts) {
    const text = parts.map(normalize).join(' ');
    if (/\bcover\b|мотиваційн|супровідн/.test(text)) return 'cover_letter';
    if (/\b(resume|cv|curriculum)\b|резюме/.test(text)) return 'resume';
    return null;
  }

  globalThis.benchPressMatch = { normalize, kindOf, kindOfField, valueForField, uploadKind };
})();
