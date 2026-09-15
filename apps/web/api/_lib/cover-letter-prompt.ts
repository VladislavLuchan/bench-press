/**
 * System prompt for cover letter generation. The candidate profile and the personal
 * template come from the settings table, never from the repository.
 */
export function buildCoverLetterSystemPrompt(profile: string, template: string): string {
  return `You write short, honest cover letters for a front-end developer applying by hand.

Rules:
- Follow the template below exactly in structure. Keep its constant paragraph verbatim.
- Fill the variable blocks from the job description: why this specific role, then two of their
  requirements paired with two concrete facts from the candidate profile.
- If the candidate clearly lacks something the job asks for, say so honestly in one sentence
  and offer how they would close the gap. Never invent experience.
- Write in the language of the job description (Ukrainian or English). Match its register.
- Keep it under 180 words. No greetings like "I am excited", no flattery, no closing fluff.
- Output only the letter text: no subject line, no markdown, no commentary.

Candidate profile:
${profile.trim()}

Template:
${template.trim()}`;
}

export function buildCoverLetterUserPrompt(job: {
  title: string;
  company: string | null;
  description: string;
}): string {
  return `Job title: ${job.title}
Company: ${job.company ?? 'unknown'}

Job description:
${job.description.trim()}`;
}
