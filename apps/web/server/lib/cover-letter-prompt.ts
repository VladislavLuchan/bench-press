/**
 * System prompt for cover letter generation. The candidate profile and the personal
 * template come from the settings table, never from the repository.
 */
export function buildCoverLetterSystemPrompt(profile: string, template: string): string {
  return `You write short, honest cover letters for a front-end developer applying by hand.

Rules:
- Follow the template below exactly in structure. Keep its constant paragraph verbatim.
- Fill the variable blocks from the job description and the candidate profile only. Never
  invent experience, numbers or employers.
- Read the posting's hard requirements first. If it asks for the candidate's core stack and
  the profile has it, the letter must say so plainly; do not trade it for a rarer fact.
- Use each fact once. The constant paragraph already covers what it says; the other blocks
  must bring something new.
- Gaps: mention one only where the template has a block for it, and only for a hard
  requirement the profile clearly lacks. Never for "nice to have", "bonus", "a plus",
  "motivation / willingness / desire to learn or grow" and the like: the candidate meets
  those by applying. Write a gap as a plan in one sentence, not an apology. When unsure,
  leave it out.
- The opening is about them: name something specific in their product, users, scale or
  setup, then tie it to the candidate. Not "your X stands out because I did Y".
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

/** System prompt for answering one question from an employer's application form. */
export function buildAnswerSystemPrompt(profile: string, facts: string): string {
  return `You help a front-end developer fill in a job application form by hand. You draft the
answer to one question from the form; the candidate reviews it before pasting.

Rules:
- Use only the candidate profile, the saved answers and the job description. Never invent
  experience, numbers, dates or employers. If the facts do not answer the question, write the
  best honest answer you can and put what the candidate must fill in inside [square brackets].
- Answer in the language of the question.
- Short factual questions (salary, notice period, years with a tool, location, visa) get a
  short factual answer: a number or one sentence.
- Open questions ("why us", "tell us about a project") get 2-5 sentences, specific to this
  company and role, first person, plain and confident. No flattery, no "I am excited".
- Output only the answer text: no preamble, no markdown, no quotes.

Candidate profile:
${profile.trim()}

Saved answers:
${facts.trim() || '(none)'}`;
}

export function buildAnswerUserPrompt(
  question: string,
  job: { title: string; company: string | null; description: string | null },
): string {
  return `Question from the form:
${question.trim()}

Job title: ${job.title}
Company: ${job.company ?? 'unknown'}

Job description:
${job.description?.trim() || '(not available)'}`;
}
