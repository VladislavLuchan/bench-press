import type { JobSummary } from '@bench-press/shared';

export interface TelegramOptions {
  botToken: string;
  chatId: string;
  dashboardUrl: string | undefined;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** One compact message per match; fit first so it can be scanned on a phone. */
export function formatJobMessage(job: JobSummary, dashboardUrl: string | undefined): string {
  const fit = job.fitRaw !== null && job.fitRaw !== job.fit ? `${job.fitRaw}→${job.fit}` : `${job.fit}`;
  const header = `<b>${fit}/10</b> ${escapeHtml(job.title)}`;
  const company = [job.company, job.salaryRaw ?? job.salaryLlm, job.locationType]
    .filter(Boolean)
    .join(' · ');
  const lines = [
    header,
    company ? escapeHtml(company) : null,
    job.summary ? `\n${escapeHtml(job.summary)}` : null,
    job.gaps.length > 0 ? `\nGaps: ${escapeHtml(job.gaps.join('; '))}` : null,
    `\n<a href="${job.url}">${job.source}</a>` +
      (dashboardUrl ? ` · <a href="${dashboardUrl}/#/jobs/${job.id}">dashboard</a>` : ''),
  ];
  return lines.filter((line): line is string => line !== null).join('\n');
}

/** Sends one message via the Bot API. Outbound only: the bot never reads updates. */
export async function sendTelegramMessage(options: TelegramOptions, text: string): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${options.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: options.chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Telegram HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
}
