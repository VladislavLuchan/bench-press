# bench-press extension

A small Chrome extension (Manifest V3, plain JavaScript, no build step) that makes applying on
employer sites faster. It never submits anything: every action starts with a click in its
side panel, and the user presses the site's own Submit button.

## What it does

- **Opens jobs in a normal window.** With the extension installed, the dashboard opens a
  listing through it instead of a popup. A popup has no tabs, so an "Apply" link on LinkedIn
  used to land in the main browser window; now the employer site opens as a tab in the job's
  own window. Closing that window highlights the dashboard's "Applied?" prompt.
- **Side panel** (toolbar icon or Alt+Shift+B) next to the employer's form:
  - the job, with **Applied** and **Skip** (the dashboard updates at once);
  - **your answers** from Settings → Application form answers: Copy, Fill (into the field
    you clicked last), and **Fill matching fields** for every empty field whose label matches
    (name, email, phone, LinkedIn, GitHub, location, salary, notice period, or a label saved
    word for word);
  - **cover letter**: Attach PDF puts the letter into the page's cover letter upload (never
    into a resume/CV upload; when unsure it downloads the file instead), Download PDF, Copy,
    Fill;
  - **question from the form**: paste a custom question and get a draft answer written from
    your profile, saved answers and the job description.

## Install

1. `chrome://extensions` → enable **Developer mode** → **Load unpacked** → pick
   `apps/extension` from this repository.
2. Open the dashboard once. The extension reads the dashboard token from it, so there is
   nothing to configure.
3. Optional: `chrome://extensions/shortcuts` to change Alt+Shift+B.

After `git pull`, press the reload icon on the extension card.

The dashboard address is fixed in `manifest.json` (`content_scripts[0].matches`); change it
there if the dashboard moves.

## Notes

- Opening the side panel needs a user gesture. The extension tries to open it together with
  the job window; if Chrome refuses, press the icon or Alt+Shift+B once in that window.
- Host access to all sites is needed so the panel can fill fields on any employer's site. Page
  scripts (`src/page/*`) are injected only when a panel button is pressed.
- `src/page/match.js` is pure and tested (`npm test -w @bench-press/extension`).
