import { build } from 'esbuild';

await build({
  entryPoints: ['src/cli.ts'],
  outfile: 'dist/cronito.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
});
