// Bundles the API into one self-contained ESM file for Vercel. Vercel compiles TypeScript
// file by file and does not rewrite `.ts` import specifiers, so shipping a single bundle
// (with the shared workspace package inlined) avoids module-resolution surprises at runtime.
import { build } from 'esbuild';

await build({
  entryPoints: ['server/index.ts'],
  outfile: 'api/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // Real dependencies stay external; Vercel traces them from node_modules.
  external: ['@libsql/client', 'zod'],
  sourcemap: false,
  logLevel: 'info',
});
