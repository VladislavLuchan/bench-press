import type { LetterBrief } from './letter-brief.ts';

// Cover letters are written in three steps (see llm.ts): plan a brief, write from it, then fix
// what the checks in letter-lint.ts flag. The principles below come from what hiring
// managers report and from studies of AI-written letters:
// - the opening decides whether the rest is read, so it carries the strongest proof;
// - one concrete story with a result beats a list of technologies;
// - after AI tools spread, mirroring the posting's wording lost about half its effect on
//   callbacks (arXiv:2509.25054), so letters say what the candidate did instead;
// - generic letters are rejected, and uniform, dash-heavy, cliché prose reads as a bot.

type JobInput = { title: string; company: string | null; description: string };

function jobBlock(job: JobInput): string {
  return `Job title: ${job.title}
Company: ${job.company ?? 'unknown'}

Job description:
${job.description.trim()}`;
}

/**
 * Step 1: read the posting like the hiring manager and decide what the letter must prove.
 * The candidate profile and the template come from the settings table.
 */
export function buildBriefSystemPrompt(profile: string, template: string): string {
  return `You plan a cover letter for a front-end developer who applies by hand. Read the job
posting the way its hiring manager would, then decide what the letter has to prove. Use only
facts from the candidate profile.

Return JSON only:
{
  "company_detail": "one concrete thing about them from the posting: product, users, scale, stack, setup or a problem they have. Not a generic value such as 'AI-driven culture' or 'fast-paced'.",
  "needs": [
    {
      "need": "the posting's most important requirement or challenge, in your own words",
      "evidence": "the strongest matching fact from the profile: where, what the candidate did, what came of it. Numbers only if the profile has them."
    },
    { "need": "the second most important one", "evidence": "a different fact" }
  ],
  "gap": "a hard must-have the profile clearly lacks, or null",
  "close_offer": "one concrete thing from the evidence the candidate could show on a call"
}

Rules:
- Order needs by importance to the employer: the first must-haves and the core daily work,
  not the most impressive facts. If the posting asks for the candidate's core stack and the
  profile has it, one need is that stack, and its evidence is work done with it, not a count
  of years.
- Evidence must not repeat the constant paragraph of the template; it is printed anyway.
- gap is null for nice-to-haves, bonuses, "a plus", and "motivation / willingness to learn or
  grow". When unsure, null.

Candidate profile:
${profile.trim()}

Template (for the constant paragraph):
${template.trim()}`;
}

export function buildBriefUserPrompt(job: JobInput): string {
  return jobBlock(job);
}

/** Step 2: write the letter from the template, the profile and the brief. */
export function buildCoverLetterSystemPrompt(profile: string, template: string): string {
  return `You write cover letters for a front-end developer who applies by hand and reads every
letter before sending it. The reader is a busy hiring manager who skims it in under a minute.

What makes these letters work:
- The first sentence decides whether the rest gets read. Open with the strongest proof for
  this role: something the candidate did that answers the posting's biggest need, tied to a
  concrete detail of their product, users or setup.
- One real story beats a list. Say what the candidate did and what came of it, with the
  technologies named inside the story, never as a list or a years count.
- Do not mirror the posting. Never copy its phrases or restate its requirements ("You need X",
  "your posting mentions", "as required"). State what the candidate did; the reader draws the
  match.
- Honest beats polished. Only facts from the profile; never invent experience, numbers or
  employers. Mention a gap only where the template has a block for it, only for a hard
  must-have the profile lacks, as a plan in one sentence. Never for nice-to-haves, bonuses or
  "motivation / willingness to grow". When unsure, leave it out.
- Sound like a person writing to a future teammate: plain words, sentences of different
  lengths, contractions are fine. At most one dash (—) outside the constant paragraph. No
  rhetorical pairs or triplets, no "not just X but Y", no "I'm excited", "passionate",
  "thrilled", "perfect fit", "stands out", "leverage", "fast-paced", "look forward".

Rules:
- Follow the template's blocks in order. Keep its constant paragraph verbatim.
- Use each fact once; the constant paragraph already covers what it says.
- Write in the language of the job description (Ukrainian or English).
- 130 to 200 words. Output only the letter text: no subject line, no markdown, no commentary.

Candidate profile:
${profile.trim()}

Template:
${template.trim()}`;
}

function briefBlock(brief: LetterBrief): string {
  const needs = brief.needs
    .map((item, index) => `${index + 1}. ${item.need}\n   Evidence: ${item.evidence}`)
    .join('\n');
  return `Plan from a first read of the posting (follow it unless it contradicts the profile):
About them: ${brief.companyDetail}
What the letter must prove, most important first:
${needs}
Gap: ${brief.gap ?? 'none, skip the gap block'}
Offer on a call: ${brief.closeOffer ?? 'pick one concrete thing from the letter'}`;
}

export function buildCoverLetterUserPrompt(job: JobInput, brief: LetterBrief | null): string {
  return brief ? `${jobBlock(job)}\n\n${briefBlock(brief)}` : jobBlock(job);
}

/** Step 3: fix what the checks found, leaving the rest alone. */
export function buildRevisionUserPrompt(letter: string, problems: string[]): string {
  return `A check of this cover letter found problems. Fix every one of them and change as little
else as possible: keep the constant paragraph verbatim, keep the facts, keep the language.
Output only the corrected letter.

Problems:
${problems.map((problem) => `- ${problem}`).join('\n')}

Letter:
${letter.trim()}`;
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
