import { useState } from 'react';

/** Terms worth spotting at a glance: the stack that fits, and the things that usually do not. */
const GOOD = /\b(react|typescript|next\.?js|node(\.js)?|electron|remote|frontend|front-end)\b/gi;
const BAD =
  /\b(angular|vue|\.net|java\b|python|php|hybrid|on-?site|office|relocat\w*|senior\+|lead|manager|\d\+? ?years?)\b/gi;

function highlight(line: string): Array<string | { text: string; tone: 'good' | 'bad' }> {
  const parts: Array<string | { text: string; tone: 'good' | 'bad' }> = [];
  const pattern = new RegExp(`${GOOD.source}|${BAD.source}`, 'gi');
  let last = 0;
  for (const match of line.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(line.slice(last, index));
    const text = match[0];
    parts.push({ text, tone: new RegExp(GOOD.source, 'i').test(text) ? 'good' : 'bad' });
    last = index + text.length;
  }
  if (last < line.length) parts.push(line.slice(last));
  return parts;
}

const PREVIEW_LINES = 28;

/**
 * Description as readable paragraphs and bullets with the decisive words highlighted.
 * Open by default; long texts show the first screen with a button for the rest.
 */
export function JobDescription({ text }: { text: string | null }) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return <p className="description__empty">Description not fetched yet.</p>;

  const lines = text.split('\n');
  const visible = expanded ? lines : lines.slice(0, PREVIEW_LINES);
  const truncated = lines.length > PREVIEW_LINES;

  return (
    <div className="description">
      {visible.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={index} className="description__gap" />;
        const bullet = /^[-•*]\s+/.test(trimmed);
        const heading = trimmed.length < 60 && /[:：]$/.test(trimmed);
        const content = highlight(bullet ? trimmed.replace(/^[-•*]\s+/, '') : trimmed).map((part, i) =>
          typeof part === 'string' ? (
            part
          ) : (
            <mark key={i} className={`description__term description__term--${part.tone}`}>
              {part.text}
            </mark>
          ),
        );
        if (heading) return <h4 key={index} className="description__heading">{content}</h4>;
        if (bullet) return <li key={index} className="description__bullet">{content}</li>;
        return <p key={index} className="description__line">{content}</p>;
      })}
      {truncated && (
        <button type="button" className="btn btn--ghost btn--small" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Show less' : `Show all (${lines.length - PREVIEW_LINES} more lines)`}
        </button>
      )}
    </div>
  );
}
