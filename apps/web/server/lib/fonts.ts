// Noto Sans (SIL Open Font License, see server/fonts/OFL.txt) covers Latin and Cyrillic, so
// Ukrainian letters render too. esbuild inlines the files as bytes (see build-api.mjs); the
// cast is needed because vite/client types `*.ttf` imports as URL strings.
import bold from '../fonts/NotoSans-Bold.ttf';
import regular from '../fonts/NotoSans-Regular.ttf';
import type { LetterFonts } from './cover-letter-pdf.ts';

export const letterFonts: LetterFonts = {
  regular: regular as unknown as Uint8Array,
  bold: bold as unknown as Uint8Array,
};
