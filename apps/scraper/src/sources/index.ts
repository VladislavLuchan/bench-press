import { djinni } from './djinni.ts';
import { dou } from './dou.ts';
import { linkedin } from './linkedin.ts';
import { nofluffjobs } from './nofluffjobs.ts';
import type { Source } from './types.ts';

/** Registry of enabled sources. Add a module here to plug a new board into the pipeline. */
export const sources: readonly Source[] = [djinni, linkedin, dou, nofluffjobs];
