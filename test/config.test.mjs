import test from 'node:test';
import assert from 'node:assert/strict';
import {defineConfig, browserOptions, buildZarazConfiguration, scopeAllows} from '../src/index.mjs';
import {fixture} from './fixtures.mjs';

test('an empty configuration installs no tools, creates no dummy purposes, and remains disabled by default', () => {
  const config = defineConfig({origin: 'https://empty.example'});
  assert.equal(config.enabled, false); assert.deepEqual(browserOptions(config).purposeIds, []);
  const plan = buildZarazConfiguration({}, config);
  assert.equal(plan.consent.enabled, false); assert.deepEqual(plan.tools, {}); assert.deepEqual(plan.triggers, {});
});
test('native tools are declarative and scoped; source and base remain untouched', () => {
  const config = fixture(), base = {tools: {}, settings: {custom: true}, variables: {local: {value: 'fixture'}}};
  const before = JSON.stringify(base), plan = buildZarazConfiguration(base, config);
  assert.equal(JSON.stringify(base), before); assert.equal(plan.settings.custom, true);
  assert.equal(plan.settings.autoInjectScript, false); assert.equal(plan.settings.injectIframes, false);
  assert.equal(plan.dataLayer, false); assert.equal(plan.historyChange, false);
  assert.equal(plan.tools.Content.defaultPurpose, 'media');
  assert.deepEqual(plan.consent.purposes.media, {name: 'Optional content', description: 'Show requested optional content.'});
  const rules = plan.triggers.Pageview.loadRules;
  assert.equal(rules.find(rule => rule.id === 'EhvenScopeOrigin').value, config.origin);
  const paths = new RegExp(rules.find(rule => rule.id === 'EhvenScopePath').value);
  assert.equal(paths.test('/news.v1/'), true); assert.equal(paths.test('/newsXv1/'), false);
  assert.equal(paths.test('/private/example/'), false); assert.equal(paths.test('/draft/'), false);
  assert.equal(rules.find(rule => rule.id === 'EhvenScopeQuery').value, '');
  assert.ok(Object.isFrozen(config.tools.Content.settings));
});
test('custom events use the shared scope gates and reference checks', () => {
  const source = JSON.parse(JSON.stringify(fixture()));
  source.triggers.Interaction = {name: 'Interaction', loadRules: [{id: 'event', match: '{{ client.__zarazTrack }}', op: 'EQUALS', value: 'OpenMedia'}]};
  source.tools.Content.actions.ShowContent.firingTriggers = ['Interaction'];
  const plan = buildZarazConfiguration({}, source);
  assert.equal(plan.triggers.Interaction.loadRules.length, 4);
  source.tools.Content.actions.ShowContent.firingTriggers = ['Unknown'];
  assert.throws(() => defineConfig(source), /reference/);
});
test('no tool bypasses declared purposes; unused purposes are omitted from the native modal', () => {
  const source = JSON.parse(JSON.stringify(fixture()));
  source.purposes.unused = {name: 'Unused', description: 'Not offered.'};
  assert.equal(buildZarazConfiguration({}, source).consent.purposes.unused, undefined);
  delete source.tools.Content.defaultPurpose;
  assert.throws(() => defineConfig(source), /purpose/);
});
test('multilingual purpose names and plain-text intro are escaped correctly', () => {
  const source = JSON.parse(JSON.stringify(fixture()));
  source.language = 'he'; source.intro = {en: '<script>unsafe</script>', he: 'בחירה & פרטיות'};
  source.purposes = {media: {name: {en: 'Content', he: 'תוכן'}, description: {en: 'Optional', he: 'לבחירה'}}, metrics: {name: {he: 'מדידה'}, description: {he: 'מדידה לבחירה'}}};
  source.privacyUrl = '/privacy/?a=1&b=2';
  const plan = buildZarazConfiguration({}, source);
  assert.equal(plan.consent.defaultLanguage, 'he'); assert.equal(plan.consent.purposes.media.name, 'תוכן');
  assert.match(plan.consent.consentModalIntroHTMLWithTranslations.en, /&lt;script&gt;/);
  assert.match(plan.consent.consentModalIntroHTML, /&amp;/);
});
test('browser serialization excludes native provider settings and operator configuration', () => {
  const serialized = JSON.stringify(browserOptions(fixture()));
  assert.equal(serialized.includes('synthetic-account'), false); assert.equal(serialized.includes('htmlCode'), false);
  assert.equal(serialized.includes('tools'), false); assert.equal(serialized.includes('Optional local content'), false);
});
test('origin/path/private/privacy rules fail closed', () => {
  const config = fixture();
  assert.equal(scopeAllows(config.origin + '/', config), true);
  for (const url of ['http://fixture.example/', 'https://sub.fixture.example/', 'https://fixture.example/?private=1', 'https://fixture.example/#private', 'https://fixture.example/private/example/', 'https://fixture.example/draft/', 'https://user:password@fixture.example/', 'invalid']) assert.equal(scopeAllows(url, config), false, url);
  assert.equal(scopeAllows(config.origin, config, {globalPrivacyControl: true}), false);
  assert.equal(scopeAllows(config.origin, config, {doNotTrack: '1'}), false);
  assert.equal(scopeAllows(config.origin, {...config, enabled: false}), false);
  assert.equal(scopeAllows(config.origin, {...config, privateRoots: ['/']}), false);
  assert.equal(scopeAllows(config.origin + '/%70rivate/example/', {...config, paths: ['/%70rivate/example/']}), false);
});
test('invalid identities, paths, data structures and unknown options are rejected before runtime', () => {
  const invalid = [
    {origin: 'https://fixture.example/'}, {origin: 'https://user:password@fixture.example'},
    {paths: ['//outside.example/']}, {paths: ['/a/../b']}, {paths: ['/x?query']}, {paths: ['/%2fsecret']},
    {paths: ['/', '/']}, {enabled: 'true'}, {loaderTimeoutMs: Infinity}, {loaderTimeoutMs: 0},
    {cookieName: 'bad;cookie'}, {reloadOnWithdrawal: 'yes'}, {unexpected: true}, {privacyUrl: 'javascript:alert(1)'},
  ];
  for (const values of invalid) assert.throws(() => fixture(values), TypeError);
  assert.throws(() => defineConfig(JSON.parse('{"origin":"https://sample.example","__proto__":{}}')), /unsafe/);
  let getterCalled = false;
  const withGetter = {origin: 'https://sample.example', get paths() {getterCalled = true; return ['/'];}};
  assert.throws(() => defineConfig(withGetter), /data properties/); assert.equal(getterCalled, false);
  const array = []; Object.defineProperty(array, '0', {enumerable: true, get() {getterCalled = true; return '/';}});
  assert.throws(() => defineConfig({origin: 'https://sample.example', paths: array}), /data properties/); assert.equal(getterCalled, false);
  const cyclic = {}; cyclic.cyclic = cyclic;
  assert.throws(() => defineConfig(cyclic), /structural/);
});
test('existing native state is protected from silent replacement', () => {
  for (const base of [{tools: {Foreign: {}}}, {triggers: {Foreign: {}}}]) assert.throws(() => buildZarazConfiguration(base, fixture()), /existing/);
});
test('native listener, timer, form, variable, scroll and visibility rules retain shared scope enforcement', () => {
  const source = JSON.parse(JSON.stringify(fixture()));
  const rules = [
    {id: 'click', action: 'clickListener', settings: {selector: '#open', type: 'css', waitForTags: 500}},
    {id: 'clock', action: 'timer', settings: {interval: 1000, limit: 1}},
    {id: 'form', action: 'formSubmission', settings: {selector: '#inquiry', validate: true}},
    {id: 'variable', action: 'variableMatch', settings: {variable: 'contentMode', match: 'open'}},
    {id: 'scroll', action: 'scrollDepth', settings: {positions: '45%'}},
    {id: 'visible', action: 'elementVisibility', settings: {selector: '#media'}},
  ];
  for (const rule of rules) source.triggers[rule.id] = {name: rule.id, loadRules: [rule], excludeRules: [rule]};
  const plan = buildZarazConfiguration({}, source);
  for (const rule of rules) {
    assert.deepEqual(plan.triggers[rule.id].loadRules[0], rule);
    assert.deepEqual(plan.triggers[rule.id].excludeRules, [rule]);
    assert.deepEqual(plan.triggers[rule.id].loadRules.slice(1).map(value => value.id), ['EhvenScopeOrigin', 'EhvenScopePath', 'EhvenScopeQuery']);
  }
  for (const rule of [
    {id: 'bad', action: 'timer', settings: {interval: 49, limit: 1}},
    {id: 'bad', action: 'clickListener', settings: {selector: '#x', type: 'javascript', waitForTags: 0}},
    {id: 'bad', action: 'formSubmission', settings: {selector: '#x', validate: 'true'}},
    {id: 'bad', action: 'unknown', settings: {}},
  ]) assert.throws(() => defineConfig({...source, triggers: {Bad: {name: 'Invalid', loadRules: [rule]}}}), TypeError);
});
