import test from 'node:test';
import assert from 'node:assert/strict';
import {installConsentController} from '../src/browser.mjs';
import {browserFixture, publicOptions} from './fixtures.mjs';

const environment = fixture => ({window: fixture.win, document: fixture.doc});
test('idle and ineligible controllers make no bootstrap requests', () => {
  for (const options of [{...publicOptions(), enabled: false}, {...publicOptions(), purposeIds: []}]) {
    const page = browserFixture(); const controller = installConsentController(options, environment(page));
    assert.equal(controller.getSnapshot().state, 'idle'); assert.equal(page.doc.scripts.length, 0); controller.destroy();
  }
  for (const entry of [{url: 'https://fixture.example/private/example/'}, {url: 'https://fixture.example/?private=1'}, {referrer: 'https://fixture.example/private/example/'}, {privacy: {globalPrivacyControl: true}}, {privacy: {doNotTrack: '1'}}]) {
    const page = browserFixture(entry), controller = installConsentController(publicOptions(), environment(page));
    assert.equal(controller.getSnapshot().state, 'ineligible'); assert.equal(page.doc.scripts.length, 0);
    assert.equal(controller.openSettings(), false); controller.destroy();
  }
});
test('one bootstrap, native readiness and explicit purpose-gated dispatch', () => {
  const page = browserFixture(), options = publicOptions(), env = environment(page);
  const controller = installConsentController(options, env);
  assert.equal(installConsentController({...options}, env), controller); assert.equal(page.doc.scripts.length, 1);
  assert.equal(page.doc.scripts[0].referrerPolicy, 'origin');
  assert.equal(controller.track('Open', {}, 'media'), false);
  const choices = {media: true, metrics: false}; page.native(choices);
  assert.equal(controller.getSnapshot().ready, true); assert.equal(page.settings.hidden, false);
  assert.equal(controller.openSettings(), true); assert.equal(page.win.zaraz.consent.modal, true);
  assert.equal(controller.track('Open', {kind: 'example'}, 'media'), true);
  assert.equal(controller.track('Count', {}, 'metrics'), false); assert.equal(page.tracks.length, 1);
  assert.equal(controller.track('Count', {}, 'unknown'), false);
  assert.throws(() => controller.track('Open', {}, ''), /purpose/);
  assert.throws(() => installConsentController({...options, loaderTimeoutMs: 500}, env), /different controller/);
  controller.destroy();
});
test('bootstrap download without native API reports timeout and never readiness', () => {
  const page = browserFixture(), states = [];
  const controller = installConsentController(publicOptions(), {...environment(page), onState: snapshot => states.push(snapshot.state)});
  page.doc.scripts[0].dispatchEvent(new Event('load'));
  for (const callback of page.timers.values()) callback();
  assert.deepEqual(states, ['bootstrap-requested', 'bootstrap-loaded', 'consent-api-timeout']);
  assert.equal(controller.getSnapshot().ready, false); controller.destroy();
});
test('connector cookie ownership, withdrawal and cleanup are generic and isolated', () => {
  const page = browserFixture(), changes = [];
  const connector = {id: 'Example', purpose: 'media', cookies: [{name: 'sample_visitor', purpose: 'media'}], onConsentChange: value => changes.push(value)};
  const controller = installConsentController(publicOptions(), {...environment(page), connectors: [connector]});
  const choices = {media: true, metrics: false}; page.native(choices);
  choices.media = false; page.doc.dispatchEvent(new Event('zarazConsentChoicesUpdated'));
  assert.equal(page.reloads(), 1); assert.equal(changes.length, 2);
  assert.equal(changes[1].previousGranted, true); assert.equal(changes[1].granted, false);
  assert.match(page.cookieWrites[0], /^sample_visitor=; Max-Age=0; Path=\//);
  assert.equal(page.cookieWrites.some(value => value.startsWith('fixture_consent=')), false);
  controller.destroy();
});
test('privacy or native API failure after startup denies dispatch and triggers withdrawal recovery', () => {
  for (const failure of ['privacy', 'api', 'url']) {
    const page = browserFixture(), controller = installConsentController(publicOptions(), environment(page));
    page.native({media: true});
    if (failure === 'privacy') page.win.navigator.globalPrivacyControl = true;
    if (failure === 'api') page.win.zaraz.consent.get = () => {throw Error('private details');};
    if (failure === 'url') page.win.location.href = 'https://fixture.example/private/example/';
    assert.equal(controller.track('Event', {}, 'media'), false); assert.equal(page.tracks.length, 0);
    assert.equal(page.reloads(), 1); assert.equal(controller.getSnapshot().choices.media, false); controller.destroy();
  }
});
test('observer errors cannot interrupt enforcement; diagnostics contain no exception payload', () => {
  const page = browserFixture(), states = [];
  const controller = installConsentController(publicOptions(), {...environment(page),
    onState: value => {states.push(value); throw Error('private details');}, onChoices: () => {throw Error('private details');},
    connectors: [{id: 'Sample', purpose: 'media', onConsentChange: () => {throw Error('private details');}}],
  });
  const choices = {media: true}; page.native(choices); choices.media = false; page.doc.dispatchEvent(new Event('zarazConsentChoicesUpdated'));
  assert.equal(page.reloads(), 1); assert.equal(JSON.stringify(states).includes('private details'), false); controller.destroy();
});
test('destroy removes owned effects and restores host UI, without deleting consent', () => {
  const page = browserFixture(); let disposed = 0;
  const controller = installConsentController(publicOptions(), {...environment(page), connectors: [{id: 'Example', purpose: 'media', onDispose: () => {disposed++;}}]});
  page.native({media: true}); controller.destroy(); controller.destroy();
  assert.equal(disposed, 1); assert.equal(page.timers.size, 0); assert.equal(page.doc.scripts.length, 0);
  assert.equal(page.settings.hidden, true); assert.equal(page.status.textContent, 'Original');
  assert.equal(page.win.zaraz.consent.get('media'), true); assert.equal(controller.track('Event', {}, 'media'), false);
  page.doc.dispatchEvent(new Event('zarazConsentChoicesUpdated')); assert.equal(page.reloads(), 0);
});
test('foreign native installations and invalid connector registrations are refused', () => {
  const page = browserFixture(); page.native({});
  const controller = installConsentController(publicOptions(), environment(page));
  assert.equal(controller.getSnapshot().state, 'existing-loader'); assert.equal(page.doc.scripts.length, 0); controller.destroy();
  for (const connectors of [[{id: 'X', purpose: 'unknown'}], [{id: 'X', purpose: 'media', cookies: [{name: 'fixture_consent', purpose: 'media'}]}], [{id: 'X', purpose: 'media'}, {id: 'X', purpose: 'media'}]]) {
    const fresh = browserFixture(); assert.throws(() => installConsentController(publicOptions(), {...environment(fresh), connectors}), TypeError);
  }
});
