import assert from 'node:assert/strict';
import {readFile, readdir, stat} from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const metadata = JSON.parse(await readFile(new URL('package.json', root)));
assert.equal(metadata.name, '@ehven/cloudflare-zaraz-consent-controller-core');
assert.equal(Object.keys(metadata.dependencies ?? {}).length, 0);
assert.equal(Object.keys(metadata.optionalDependencies ?? {}).length, 0);
for (const entry of Object.values(metadata.exports)) {
  await stat(new URL(entry.types, root)); await import(new URL(entry.import, root));
}
for (const name of await readdir(new URL('src/', root))) {
  const source = await readFile(new URL(`src/${name}`, root), 'utf8');
  assert.equal(/hubspot|beacon\.min\.js|portalId|google-analytics/i.test(source), false, `Provider leaked into ${name}`);
}
const browserFiles = ['browser.mjs', 'policy.mjs', 'cookies.mjs', 'validation.mjs'];
const bytes = (await Promise.all(browserFiles.map(name => stat(new URL(`src/${name}`, root))))).reduce((total, item) => total + item.size, 0);
// This candidate's source graph budget excludes native service/provider payloads.
// The original site's stricter acceptance must be measured separately during migration.
assert.ok(bytes <= 20 * 1024, 'Browser source graph exceeds its declared 20 KiB package budget.');
console.log(`Package entrypoints resolve; no providers or runtime dependencies; browser source graph ${bytes} bytes.`);
