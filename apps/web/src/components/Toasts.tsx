import { useToasts } from '../lib/toast.ts';

export function Toasts() {
  const toasts = useToasts();
  if (toasts.length === 0) return null;
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((item) => (
        <div key={item.id} className={`toast toast--${item.tone}`}>
          {item.text}
        </div>
      ))}
    </div>
  );
}
