interface Props {
  open: boolean;
  onClose: () => void;
}

const GROUPS: Array<{ title: string; keys: Array<[string, string]> }> = [
  {
    title: 'Navigate',
    keys: [
      ['↓ / ↑  or  Alt+J / Alt+K  or  j / k', 'next / previous job or card'],
      ['Enter', 'open the focused job'],
      ['Esc', 'close the detail panel, help, or leave a text field'],
      ['Alt+Shift+1 … 5  or  1 … 5', 'Jobs, Pipeline, Filtered, Stats, Settings'],
      ['Alt+/  or  /', 'focus the filters'],
      ['Shift+/ (the ? key)  or  Alt+H', 'this help'],
    ],
  },
  {
    title: 'Act on the selected job',
    keys: [
      ['Alt+O  or  o', 'open the listing in a new window'],
      ['Alt+G  or  g', 'generate the cover letter'],
      ['Alt+C  or  c', 'copy the cover letter and open the listing'],
      ['Alt+A  or  a', 'mark applied (then moves to the next job)'],
      ['Alt+Y  or  y', 'answer "Applied?" for the listing you opened last'],
      ['Alt+R  or  r', 'mark replied'],
      ['Alt+S  or  s', 'skip (then moves to the next job)'],
      ['Alt+N  or  n', 'reset to new'],
      ['Shift+← / Shift+→', 'on the Pipeline board: move the highlighted card'],
    ],
  },
];

export function HotkeysHelp({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="help" role="dialog" aria-label="Keyboard shortcuts" onClick={onClose}>
      <div className="help__panel" onClick={(event) => event.stopPropagation()}>
        <h2 className="help__title">Keyboard shortcuts</h2>
        <p className="help__hint">
          Plain letters are for browsers without a vim extension. With Vimium or similar, use the
          Alt variants: extensions do not intercept them. Alt combos also work while typing.
        </p>
        {GROUPS.map((group) => (
          <section key={group.title} className="help__group">
            <h3 className="help__group-title">{group.title}</h3>
            <dl className="help__list">
              {group.keys.map(([key, text]) => (
                <div key={key} className="help__row">
                  <dt>
                    <kbd>{key}</kbd>
                  </dt>
                  <dd>{text}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}
