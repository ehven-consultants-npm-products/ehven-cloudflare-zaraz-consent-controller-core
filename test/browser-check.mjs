import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {browserOptions} from '../src/index.mjs';
import {fixture} from './fixtures.mjs';

const {chromium, firefox, webkit} = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const options = browserOptions(fixture());
const states = [
  {name: 'undecided', choices: {}}, {name: 'reject', choices: {media: false, metrics: false}},
  {name: 'media', choices: {media: true, metrics: false}}, {name: 'metrics', choices: {media: false, metrics: true}},
  {name: 'both', choices: {media: true, metrics: true}},
  {name: 'GPC', choices: {media: true}, blocked: true, privacy: 'globalPrivacyControl'},
  {name: 'DNT', choices: {media: true}, blocked: true, privacy: 'doNotTrack'},
  {name: 'private', path: '/private/example/', blocked: true}, {name: 'query', path: '/?private=value', blocked: true},
  {name: 'fragment', path: '/#private', blocked: true}, {name: 'referrer', blocked: true, referrer: options.origin + '/private/example/'},
];
for (const [engine, launcher] of Object.entries({chromium, firefox, webkit})) {
  if (process.env.BROWSER_ENGINE && process.env.BROWSER_ENGINE !== engine) continue;
  const executablePath = engine === 'chromium' ? process.env.CHROMIUM_EXECUTABLE_PATH : undefined;
  const browser = await launcher.launch({headless: true, ...(executablePath ? {executablePath} : {})});
  try {
    for (const scenario of states) {
      const context = await browser.newContext();
      const traffic = [];
      await context.addInitScript(({choices = {}, privacy}) => {
        window.fixtureChoices = choices;
        if (privacy) Object.defineProperty(navigator, privacy, {get: () => privacy === 'doNotTrack' ? '1' : true});
      }, scenario);
      await context.route('**/*', async route => {
        const url = new URL(route.request().url()); traffic.push(url.href);
        if (url.pathname.startsWith('/src/')) {
          const name = url.pathname.slice('/src/'.length);
          assert.match(name, /^[a-z-]+\.mjs$/);
          return route.fulfill({contentType: 'text/javascript', body: await readFile(new URL(`../src/${name}`, import.meta.url), 'utf8')});
        }
        if (url.pathname === '/dist/browser.mjs') return route.fulfill({contentType: 'text/javascript', body: await readFile(new URL('../dist/browser.mjs', import.meta.url), 'utf8')});
        if (url.pathname === '/cdn-cgi/zaraz/i.js') return route.fulfill({contentType: 'text/javascript', body: `window.zaraz={consent:{APIReady:true,get:id=>sessionStorage.getItem('fixture-denied')==='1'?false:window.fixtureChoices[id],modal:false},track:(...args)=>window.tracked.push(args)};document.dispatchEvent(new Event('zarazConsentAPIReady'));`});
        return route.fulfill({contentType: 'text/html', body: `<!doctype html><html lang="en"><title>Consent fixture</title><button data-consent-settings hidden>Cookie settings</button><output data-consent-status role="status"></output><form data-association><input name="email" value="never-export@example.test"><button>Send</button></form><script type="module">import {installConsentController} from '/dist/browser.mjs';window.tracked=[];window.controller=installConsentController(${JSON.stringify(options)},{formContexts:[{purpose:'media',selector:'form[data-association]'}]});window.fixtureReady=true;</script></html>`});
      });
      try {
        const page = await context.newPage(); page.setDefaultTimeout(10000);
        await page.goto(options.origin + (scenario.path ?? '/'), scenario.referrer ? {referer: scenario.referrer} : {});
        await page.waitForFunction(() => window.fixtureReady);
        if (!scenario.blocked) await page.waitForFunction(() => window.controller.getSnapshot().ready);
        assert.equal(traffic.some(url => url.includes('/cdn-cgi/zaraz/')), !scenario.blocked, `${engine}:${scenario.name}`);
        const result = await page.evaluate(() => window.controller.track('Open', {kind: 'fixture'}, 'media'));
        assert.equal(result, !!scenario.choices?.media && !scenario.blocked, `${engine}:${scenario.name}:dispatch`);
        await page.evaluate(() => {const form=document.querySelector('form');form.addEventListener('submit',event=>event.preventDefault());form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
        assert.equal(await page.locator('[name="consent"]').count(), scenario.choices?.media && !scenario.blocked ? 1 : 0);
        assert.equal(await page.locator('[name="hutk"]').count(), 0);
        if (!scenario.blocked) {
          await page.getByRole('button', {name: 'Cookie settings'}).focus(); await page.keyboard.press('Enter');
          assert.equal(await page.evaluate(() => window.zaraz.consent.modal), true);
        }
        if (scenario.name === 'both') {
          await Promise.all([page.waitForNavigation(), page.evaluate(() => {sessionStorage.setItem('fixture-denied','1');document.dispatchEvent(new Event('zarazConsentChoicesUpdated'));})]);
          await page.waitForFunction(() => window.controller?.getSnapshot().ready);
          assert.equal(await page.evaluate(() => window.controller.getSnapshot().choices.media), false);
          assert.equal(await page.evaluate(() => window.controller.track('Open', {}, 'media')), false);
        }
        await page.evaluate(() => {window.controller.destroy(); window.controller.destroy();});
        assert.equal(await page.locator('script[data-ehven-zaraz-core]').count(), 0);
        assert.equal(await page.locator('[data-consent-context]').count(), 0);
        assert.equal(await page.locator('[data-consent-settings]').isHidden(), true);
        assert.equal(traffic.every(url => new URL(url).origin === options.origin), true);
      } finally {await context.close();}
    }
    console.log(`PASS ${engine} ${browser.version()}: ${states.length} isolated scope/consent cases, keyboard settings, event gating and disposal. Native services mocked.`);
  } finally {await browser.close();}
}
