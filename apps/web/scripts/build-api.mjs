// Bundles the API into one self-contained ESM file that api/index.js re-exports for Vercel. Vercel compiles TypeScript
// file by file and does not rewrite `.ts` import specifiers, so shipping a single bundle
// (with the shared workspace package inlined) avoids module-resolution surprises at runtime.
import { build } from 'esbuild';

await build({
  entryPoints: ['server/index.ts'],
  outfile: 'server-dist/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // Real dependencies stay external; Vercel traces them from node_modules. pdf-lib and its
  // fontkit are bundled from their ES builds, which sidesteps CommonJS interop at runtime.
  external: ['@libsql/client', 'zod'],
  // Letter fonts are inlined as Uint8Array (server/lib/fonts.ts).
  loader: { '.ttf': 'binary' },
  sourcemap: false,
  logLevel: 'info',
});
