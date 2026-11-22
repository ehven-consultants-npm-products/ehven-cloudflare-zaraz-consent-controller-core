import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, rm, mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

const temporary = await mkdtemp(join(tmpdir(), 'zaraz-packed-'));
const run = (command, args, cwd) => execFileSync(command, args, {cwd, timeout: 60000, maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']}).toString();
try {
  const packed = JSON.parse(run('npm', ['pack', '--ignore-scripts', '--offline', '--json', '--pack-destination', temporary], process.cwd()));
  assert.equal(packed.length, 1);
  const fixture = join(temporary, 'consumer'); await mkdir(fixture);
  await writeFile(join(fixture, 'package.json'), JSON.stringify({private: true, type: 'module'}));
  run('npm', ['install', '--ignore-scripts', '--offline', '--no-audit', '--no-fund', join(temporary, packed[0].filename)], fixture);
  await writeFile(join(fixture, 'smoke.mjs'), `
    import assert from 'node:assert/strict';
    import {defineConfig,browserOptions,buildZarazConfiguration} from '@ehven/cloudflare-zaraz-consent-controller-core';
    import {installConsentController} from '@ehven/cloudflare-zaraz-consent-controller-core/browser';
    import {sameOriginPost,requestPrivacyDenied,submissionConsentGranted} from '@ehven/cloudflare-zaraz-consent-controller-core/server';
    const config=defineConfig({origin:'https://independent.example'});
    assert.equal(config.enabled,false);assert.deepEqual(browserOptions(config).purposeIds,[]);
    assert.equal(buildZarazConfiguration({},config).consent.enabled,false);
    assert.equal(typeof installConsentController,'function');
    const request=new Request(config.origin,{method:'POST',headers:{Origin:config.origin,'Sec-GPC':'1'}});
    assert.equal(sameOriginPost(request,config),true);assert.equal(requestPrivacyDenied(request),true);
    assert.equal(submissionConsentGranted(request,new FormData(),browserOptions(config),{purpose:'optional'}),false);
  `);
  run(process.execPath, ['smoke.mjs'], fixture);
  await writeFile(join(fixture, 'types.mts'), await readFile('test/types.mts'));
  run(process.execPath, [resolve('node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'es2022', 'types.mts'], fixture);
  console.log('PASS isolated packed consumer: all three exports, safe idle configuration, privacy helpers and strict declarations.');
} finally { await rm(temporary, {recursive: true, force: true}); }
