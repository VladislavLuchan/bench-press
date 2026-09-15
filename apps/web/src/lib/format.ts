const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const dateTimeFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDate(iso: string | null): string {
  return iso ? dateFormat.format(new Date(iso)) : '';
}

export function formatDateTime(iso: string | null): string {
  return iso ? dateTimeFormat.format(new Date(iso)) : '';
}

export function fitTone(fit: number | null): 'high' | 'mid' | 'low' | 'none' {
  if (fit === null) return 'none';
  if (fit >= 7) return 'high';
  if (fit >= 5) return 'mid';
  return 'low';
}
