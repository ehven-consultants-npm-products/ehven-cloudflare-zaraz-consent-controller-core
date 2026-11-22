import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
await mkdir(new URL('../dist/', import.meta.url), {recursive: true});
await build({entryPoints: [new URL('../src/browser.mjs', import.meta.url).pathname],
  outfile: new URL('../dist/browser.mjs', import.meta.url).pathname,
  bundle: true, minify: true, platform: 'browser', format: 'esm', target: 'es2022',
  sourcemap: false, legalComments: 'none', logLevel: 'silent'});
