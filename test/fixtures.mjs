import {browserOptions, defineConfig} from '../src/index.mjs';

export const fixture = (overrides = {}) => defineConfig({
  enabled: true, origin: 'https://fixture.example', paths: ['/', '/news.v1/', '/private/example/'], privateRoots: ['/private'],
  cookieName: 'fixture_consent',
  purposes: {media: {name: 'Optional content', description: 'Show requested optional content.'}, metrics: {name: 'Metrics', description: 'Optional aggregate measurements.'}},
  tools: {
    Content: {type: 'component', component: 'html', name: 'Optional local content', defaultPurpose: 'media',
      permissions: ['execute_unsafe_scripts'], settings: {}, actions: {ShowContent: {actionType: 'event', firingTriggers: ['Pageview'], data: {htmlCode: '<p>Optional fixture content</p>'}}}},
    Metrics: {type: 'component', component: 'fixture', name: 'Synthetic metrics', defaultPurpose: 'metrics',
      settings: {accountId: 'synthetic-account'}, actions: {Pageview: {actionType: 'pageview', firingTriggers: ['Pageview'], data: {}}}},
  }, ...overrides,
});
export const publicOptions = () => browserOptions(fixture());

class Element extends EventTarget {
  constructor(tag = 'div') {super(); this.tagName = tag; this.dataset = {}; this.hidden = true; this.textContent = 'Original';}
  remove() {if (this.owner) this.owner.scripts = this.owner.scripts.filter(element => element !== this);}
}
export function browserFixture({url = 'https://fixture.example/', referrer = '', privacy = {}} = {}) {
  const win = new EventTarget(), doc = new EventTarget();
  let timerId = 0, reloads = 0;
  const timers = new Map(), cookieWrites = [], tracks = [];
  Object.assign(win, {navigator: privacy, location: {href: url, reload: () => {reloads++;}},
    setTimeout: callback => {timers.set(++timerId, callback); return timerId;}, clearTimeout: id => timers.delete(id)});
  const settings = new Element('button'), status = new Element();
  Object.assign(doc, {referrer, scripts: [], createElement: tag => new Element(tag),
    querySelector(selector) {return selector === '[data-consent-settings]' ? settings : selector === '[data-consent-status]' ? status : this.scripts.find(script => Object.hasOwn(script.dataset, 'ehvenZarazCore'));},
    querySelectorAll: () => doc.scripts,
    head: {append(script) {script.owner = doc; doc.scripts.push(script);}},
  });
  Object.defineProperty(doc, 'cookie', {get: () => '', set: value => cookieWrites.push(value)});
  win.document = doc;
  const native = (choices = {}) => {
    win.zaraz = {consent: {APIReady: true, get: id => choices[id], modal: false}, track: (...args) => tracks.push(args)};
    doc.dispatchEvent(new Event('zarazConsentAPIReady'));
  };
  return {win, doc, settings, status, timers, cookieWrites, tracks, native, reloads: () => reloads};
}
