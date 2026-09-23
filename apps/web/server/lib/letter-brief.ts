import { z } from 'zod';

/** What a cover letter has to prove, decided before writing it (step 1 in llm.ts). */
export interface LetterBrief {
  companyDetail: string;
  needs: Array<{ need: string; evidence: string }>;
  gap: string | null;
  closeOffer: string | null;
}

const briefSchema = z.object({
  company_detail: z.string().trim().min(1),
  needs: z
    .array(z.object({ need: z.string().trim().min(1), evidence: z.string().trim().min(1) }))
    .min(1),
  gap: z.string().trim().nullish(),
  close_offer: z.string().trim().nullish(),
});

/** Parses the model's JSON brief; null when it is unusable, and the letter is written without it. */
export function parseLetterBrief(raw: string): LetterBrief | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  const parsed = briefSchema.safeParse(data);
  if (!parsed.success) return null;
  const { company_detail, needs, gap, close_offer } = parsed.data;
  return {
    companyDetail: company_detail,
    needs: needs.slice(0, 2),
    // Models write "null" or "none" as text now and then.
    gap: gap && !/^(null|none|n\/a|-)$/i.test(gap) ? gap : null,
    closeOffer: close_offer || null,
  };
}
