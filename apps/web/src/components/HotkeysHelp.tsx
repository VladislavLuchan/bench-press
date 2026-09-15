interface Props {
  open: boolean;
  onClose: () => void;
}

const GROUPS: Array<{ title: string; keys: Array<[string, string]> }> = [
  {
    title: 'Navigate',
    keys: [
      ['j / k', 'next / previous job'],
      ['Enter', 'open first job when none is selected'],
      ['Esc', 'close the detail panel or this help'],
      ['1 2 3 4', 'Jobs, Filtered, Stats, Settings'],
      ['/', 'focus the filters'],
    ],
  },
  {
    title: 'Act on the selected job',
    keys: [
      ['o', 'open the listing in a new tab'],
      ['c', 'copy cover letter and open (generates if needed)'],
      ['a', 'mark applied'],
      ['r', 'mark replied'],
      ['s', 'skip'],
      ['n', 'reset to new'],
    ],
  },
];

export function HotkeysHelp({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="help" role="dialog" aria-label="Keyboard shortcuts" onClick={onClose}>
      <div className="help__panel" onClick={(event) => event.stopPropagation()}>
        <h2 className="help__title">Keyboard shortcuts</h2>
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
        <p className="help__hint">Press ? to toggle this panel.</p>
      </div>
    </div>
  );
}
