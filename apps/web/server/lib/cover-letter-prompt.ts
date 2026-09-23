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
  "distinctive": "what only this posting says: how the team works, a specific product or domain problem, an unusual requirement. Something other postings would not say. Not a truism ('their product depends on reliable interfaces'), not a generic value ('AI-driven culture'), not a restated requirement.",
  "opening_fact": "the candidate's fact that answers that distinctive thing most directly",
  "needs": [
    {
      "need": "the posting's most important requirement or challenge, in your own words",
      "evidence": "the strongest matching fact from the profile: where, what the candidate did, what came of it. Numbers only if the profile has them."
    },
    { "need": "the second most important one", "evidence": "a different fact" }
  ],
  "close_offer": "one concrete thing from the evidence the candidate could show on a call"
}

Rules:
- Order needs by importance to the employer: the first must-haves and the core daily work,
  not the most impressive facts. If the posting asks for the candidate's core stack and the
  profile has it, one need is that stack, and its evidence is work done with it, not a count
  of years.
- Pick the fact that answers this posting most specifically, not the most impressive number.
  Claims any front-end developer could make (built reusable components, writes clean code,
  N years of experience) are weak evidence; use them only when nothing more specific fits.
- Evidence must not repeat the constant paragraph of the template; it is printed anyway.
- The letter never mentions what the candidate lacks. The CV is read anyway, and a missing
  line in the profile does not mean a missing skill.

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
- The first sentence decides whether the rest gets read. Open with something only this
  posting says (how the team works, their domain, an unusual requirement) and the candidate's
  fact that answers it. Never open with a truism about their product ("X depends on reliable
  interfaces", "building for millions means balancing...") or with a headline metric that
  does not answer this posting.
- Every sentence must carry a fact only this candidate could state or a detail only this
  posting has. A sentence any applicant could write goes. So does a sentence that only
  comments on the previous one ("That work meant...", "This taught me...").
- One real story beats a list. Say what the candidate did and what came of it, with the
  technologies named inside the story, never as a list or a years count.
- Do not mirror the posting. Never copy its phrases or restate its requirements ("You need X",
  "your posting mentions", "as required"). State what the candidate did; the reader draws the
  match.
- Honest beats polished. Only facts from the profile; never invent experience, numbers or
  employers.
- Never mention what the candidate lacks or has not used: no missing tools, years, seniority
  or "motivation to grow". The CV is read anyway, a volunteered weakness only gives a reason
  to reject, and a tool missing from the profile is not proof the candidate never used it.
- Sound like a person writing to a future teammate: plain words, sentences of different
  lengths, contractions are fine. At most one dash (—) outside the constant paragraph. No
  rhetorical pairs or triplets, no "not just X but Y", no "I'm excited", "passionate",
  "thrilled", "perfect fit", "stands out", "leverage", "fast-paced", "look forward".

Rules:
- Follow the template's blocks in their order; the constant paragraph is verbatim and comes
  right after the opening. Do not start two paragraphs with the same employer.
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
What only this posting says: ${brief.distinctive}
Open with it and: ${brief.openingFact ?? 'the matching fact from the profile'}
What the letter must prove, most important first:
${needs}
Offer on a call: ${brief.closeOffer ?? 'pick one concrete thing from the letter'}`;
}

export function buildCoverLetterUserPrompt(job: JobInput, brief: LetterBrief | null): string {
  return brief ? `${jobBlock(job)}\n\n${briefBlock(brief)}` : jobBlock(job);
}

/**
 * Step 3: an editor pass over every draft. Semantic problems (an obvious opening, a sentence
 * any applicant could write) need a reader; the problems found in code are added to it.
 */
export function buildRevisionUserPrompt(job: JobInput, letter: string, problems: string[]): string {
  const found =
    problems.length > 0
      ? `\nAn automatic check also found these problems; fix all of them:\n${problems
          .map((problem) => `- ${problem}`)
          .join('\n')}\n`
      : '';
  return `${jobBlock(job)}

You are the candidate's editor. Improve this cover letter before it is sent. Go through these
questions and fix every sentence that fails:
1. Does the first sentence connect something only this posting says (how the team works, the
   domain, an unusual requirement) with a specific thing the candidate did? A truism about
   their product, or a headline metric that does not answer this posting, fails.
2. Could any applicant have written this sentence? Replace it with a more specific fact from
   the profile that fits this posting, or delete it.
3. Does a sentence only comment on the previous one ("That work meant...", "This taught
   me...")? Delete it.
4. Does any sentence say what the candidate lacks or has not used (tools, years, seniority,
   "motivation to grow")? Delete it; the letter only says what the candidate did.
5. Is the constant paragraph verbatim and second? Do two paragraphs open with the same
   employer?
6. Does it read like a person: varied sentences, at most one dash (—) outside the constant
   paragraph, no clichés, no list of technologies?
${found}
Use only facts from the profile and never add a claim that is not there. Keep 130 to 200 words,
the template's block order and the language. Output only the final letter.

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
