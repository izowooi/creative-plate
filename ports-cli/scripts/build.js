import { chmod } from 'node:fs/promises';
import { build } from 'esbuild';

await build({
  bundle: true,
  entryPoints: ['bin/ports.js'],
  format: 'esm',
  logLevel: 'info',
  outfile: 'dist/ports',
  platform: 'node',
  target: ['node22']
});

await chmod('dist/ports', 0o755);
