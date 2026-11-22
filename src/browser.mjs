import {fail, freeze, identifier, jsonData, keys, origin, path, cookieName} from './validation.mjs';
import {scopeAllows} from './policy.mjs';
import {cookieDescriptors, cookieExpiry} from './cookies.mjs';

const installations = new WeakMap();
const noop = () => {};
export {scopeAllows} from './policy.mjs';
function optionsFrom(input) {
  const options = jsonData(input, 'browser options', 65536);
  keys(options, ['enabled', 'origin', 'paths', 'privateRoots', 'purposeIds', 'cookieName', 'loaderTimeoutMs', 'reloadOnWithdrawal'], 'browser options');
  origin(options.origin);
  if (typeof options.enabled !== 'boolean') fail('enabled must be boolean.');
  for (const key of ['paths', 'privateRoots', 'purposeIds']) {
    options[key] ??= [];
    if (!Array.isArray(options[key]) || options[key].length > 1000 || new Set(options[key]).size !== options[key].length) fail(`Invalid ${key}.`);
    options[key].forEach(value => key === 'purposeIds' ? identifier(value, 'purpose ID') : path(value));
  }
  options.cookieName = cookieName(options.cookieName ?? 'cf_consent');
  options.loaderTimeoutMs ??= 10000;
  if (!Number.isSafeInteger(options.loaderTimeoutMs) || options.loaderTimeoutMs < 100 || options.loaderTimeoutMs > 60000) fail('Invalid loader timeout.');
  options.reloadOnWithdrawal ??= true;
  if (typeof options.reloadOnWithdrawal !== 'boolean') fail('Invalid withdrawal policy.');
  return freeze(options);
}

/** Explicit installation; importing this module has no browser or network effects. */
export function installConsentController(input, environment = {}) {
  const options = optionsFrom(input);
  const {window: win = globalThis.window, document: doc = win?.document, connectors = [], formContexts = [], onState = noop, onChoices = noop,
    settingsElement = doc?.querySelector('[data-consent-settings]'), statusElement = doc?.querySelector('[data-consent-status]')} = environment;
  if (!win || !doc || typeof onState !== 'function' || typeof onChoices !== 'function') fail('A browser environment and callable observers are required.');
  if (!Array.isArray(connectors) || connectors.length > 100) fail('connectors must be a bounded array.');
  if (!Array.isArray(formContexts) || formContexts.length > 20) fail('formContexts must be a bounded array.');
  const forms = formContexts.map(input => {
    const form = jsonData(input);
    keys(form, ['purpose', 'selector', 'consentField', 'pageField', 'marker'], 'form context');
    if (!options.purposeIds.includes(form.purpose)) fail('Form context requires a configured purpose.');
    if (typeof form.selector !== 'string' || !form.selector || form.selector.length > 512) fail('Invalid form selector.');
    form.consentField ??= 'consent'; form.pageField ??= 'sourcePage'; form.marker ??= 'data-consent-context';
    if (![form.consentField, form.pageField].every(value => /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(value))
      || form.consentField === form.pageField || !/^data-[a-z][a-z0-9-]{0,63}$/.test(form.marker)) fail('Invalid form context fields.');
    return form;
  });
  if (new Set(forms.map(form => form.marker)).size !== forms.length) fail('Form contexts require distinct ownership markers.');
  const ids = new Set();
  const hooks = connectors.map(connector => {
    keys(connector, ['id', 'purpose', 'cookies', 'onConsentChange', 'onDispose'], 'connector');
    identifier(connector.id, 'connector ID');
    if (ids.has(connector.id)) fail('Duplicate connector ID.'); ids.add(connector.id);
    if (!options.purposeIds.includes(connector.purpose)) fail('Connector requires a configured purpose.');
    for (const key of ['onConsentChange', 'onDispose']) if (connector[key] !== undefined && typeof connector[key] !== 'function') fail('Connector hooks must be functions.');
    const cookies = cookieDescriptors(connector.cookies ?? [], options);
    if (cookies.some(cookie => cookie.purpose !== connector.purpose)) fail('Connector cookies must belong to its purpose.');
    return {...connector, cookies};
  });
  const fingerprint = JSON.stringify(options), current = installations.get(doc);
  if (current) {
    if (current.fingerprint !== fingerprint || current.forms !== JSON.stringify(forms) || current.connectors.length !== connectors.length || current.connectors.some((connector, i) => connector !== connectors[i])
      || current.onState !== onState || current.onChoices !== onChoices || current.settingsElement !== settingsElement || current.statusElement !== statusElement) fail('A different controller is installed. Dispose it before changing configuration.');
    return current.handle;
  }
  let disposed = false, state = 'idle', timer, script, installed = false, initialized = false, reloading = false;
  let choices = Object.fromEntries(options.purposeIds.map(id => [id, false]));
  const listeners = [], ownedInputs = new Set(), originalHidden = settingsElement?.hidden, originalStatus = statusElement?.textContent;
  const clearInputs = () => {ownedInputs.forEach(node => node.remove()); ownedInputs.clear();};
  const observe = (observer, value) => {
    try {Promise.resolve(observer(value)).catch(noop);} catch { /* Observers never interrupt consent enforcement. */ }
  };
  const snapshot = () => freeze({state, ready: state === 'consent-ready', choices: {...choices}});
  const emit = next => { if (!disposed) {state = next; observe(onState, snapshot());} };
  const invoke = (hook, value) => {
    if (!hook) return;
    try {
      const result = hook(value);
      if (result && typeof result.then === 'function') { Promise.resolve(result).catch(noop); emit('connector-error'); }
    } catch { emit('connector-error'); }
  };
  const api = () => { try { const value = win.zaraz?.consent; return value?.APIReady === true && typeof value.get === 'function' ? value : undefined; } catch { return; } };
  const eligible = () => {
    if (!scopeAllows(win.location.href, options, win.navigator)) return false;
    if (!doc.referrer) return true;
    try { const value = new URL(doc.referrer); return value.origin !== options.origin || scopeAllows(value.href, options); }
    catch { return false; }
  };
  const reload = () => {
    if (!reloading && options.reloadOnWithdrawal) { reloading = true; win.location.reload(); }
  };
  const update = (next, reason) => {
    const previous = choices; choices = next;
    const changed = !initialized || options.purposeIds.some(id => previous[id] !== next[id]);
    if (!changed) return;
    for (const connector of hooks) {
      const granted = next[connector.purpose];
      if (!granted) for (const cookie of connector.cookies) if (!cookie.httpOnly) doc.cookie = cookieExpiry(cookie);
      if (!initialized || previous[connector.purpose] !== granted) invoke(connector.onConsentChange, freeze({purpose: connector.purpose, granted, previousGranted: previous[connector.purpose], reason}));
    }
    observe(onChoices, freeze({...next}));
    const withdrawn = initialized && options.purposeIds.some(id => previous[id] && !next[id]);
    initialized = true;
    if (withdrawn) {clearInputs(); reload();}
  };
  const refresh = () => {
    if (disposed || !installed) return snapshot();
    if (!eligible()) {
      update(Object.fromEntries(options.purposeIds.map(id => [id, false])), 'scope-denied');
      emit('ineligible'); return snapshot();
    }
    const consent = api();
    if (!consent) {
      if (initialized) {update(Object.fromEntries(options.purposeIds.map(id => [id, false])), 'api-unavailable'); emit('consent-api-error');}
      return snapshot();
    }
    try {
      const next = Object.fromEntries(options.purposeIds.map(id => [id, consent.get(id) === true]));
      win.clearTimeout(timer);
      update(next, 'native-consent');
      if (settingsElement) settingsElement.hidden = false;
      if (statusElement) statusElement.textContent = '';
      emit('consent-ready');
    } catch {
      update(Object.fromEntries(options.purposeIds.map(id => [id, false])), 'api-error');
      emit('consent-api-error');
    }
    return snapshot();
  };
  const openSettings = () => {
    if (disposed || !installed || !eligible()) return false;
    try {const consent = api(); if (!consent) return false; consent.modal = true; return true;} catch {return false;}
  };
  const listen = (target, event, callback, capture = false) => { target.addEventListener(event, callback, capture); listeners.push(() => target.removeEventListener(event, callback, capture)); };
  const handle = Object.freeze({
    getSnapshot: snapshot, refresh, openSettings,
    track(name, properties = {}, purpose) {
      identifier(purpose, 'purpose ID');
      if (typeof name !== 'string' || !name.trim() || name.length > 128 || /[\u0000-\u001f\u007f]/.test(name)) fail('Invalid event name.');
      const payload = jsonData(properties, 'event properties', 16384);
      if (!payload || Array.isArray(payload) || typeof payload !== 'object') fail('Event properties must be an object.');
      refresh();
      if (disposed || !installed || !eligible() || !options.purposeIds.includes(purpose) || !choices[purpose] || !api()) return false;
      try { if (typeof win.zaraz.track !== 'function') return false; win.zaraz.track(name, payload); return true; }
      catch { emit('dispatch-error'); return false; }
    },
    destroy() {
      if (disposed) return;
      win.clearTimeout(timer); listeners.forEach(remove => remove());
      clearInputs();
      script?.remove();
      hooks.forEach(connector => invoke(connector.onDispose, undefined));
      if (settingsElement) settingsElement.hidden = originalHidden;
      if (statusElement) statusElement.textContent = originalStatus;
      emit('disposed'); disposed = true; installations.delete(doc);
      // Existing SDKs and native consent are not erased. Reload to stop their code.
    },
  });
  installations.set(doc, {handle, fingerprint, forms: JSON.stringify(forms), connectors: [...connectors], onState, onChoices, settingsElement, statusElement});
  if (!options.enabled || !options.purposeIds.length) {emit('idle'); return handle;}
  if (!eligible()) {emit('ineligible'); return handle;}
  // An independently loaded manager is outside this controller's ownership.
  if (win.zaraz || doc.querySelector('script[data-ehven-zaraz-core]') || [...doc.querySelectorAll('script[src]')].some(node => {
    try {return new URL(node.src, win.location.href).pathname === '/cdn-cgi/zaraz/i.js';} catch {return false;}
  })) {emit('existing-loader'); return handle;}
  installed = true;
  listen(doc, 'zarazConsentAPIReady', refresh); listen(doc, 'zarazConsentChoicesUpdated', refresh);
  listen(doc, 'visibilitychange', refresh); listen(win, 'pageshow', refresh);
  listen(win, 'hashchange', refresh); listen(win, 'popstate', refresh);
  if (settingsElement) listen(settingsElement, 'click', openSettings);
  if (forms.length) listen(doc, 'submit', event => {
    const form = event.target;
    if (typeof form?.matches !== 'function') return;
    refresh();
    for (const binding of forms) {
      let matches = false; try {matches = form.matches(binding.selector);} catch {emit('connector-error');}
      if (!matches) continue;
      for (const node of form.querySelectorAll(`[${binding.marker}]`)) {node.remove(); ownedInputs.delete(node);}
      if (disposed || !eligible() || state !== 'consent-ready' || choices[binding.purpose] !== true) continue;
      for (const [name, value] of [[binding.consentField, 'granted'], [binding.pageField, options.origin + new URL(win.location.href).pathname]]) {
        const input = doc.createElement('input'); input.type = 'hidden'; input.name = name; input.value = value;
        input.setAttribute(binding.marker, ''); form.append(input); ownedInputs.add(input);
      }
    }
  }, true);
  script = doc.createElement('script'); script.src = '/cdn-cgi/zaraz/i.js'; script.async = true;
  script.referrerPolicy = 'origin'; script.dataset.ehvenZarazCore = '';
  listen(script, 'load', () => {emit(api() ? 'consent-ready' : 'bootstrap-loaded'); refresh();});
  listen(script, 'error', () => {
    win.clearTimeout(timer); update(Object.fromEntries(options.purposeIds.map(id => [id, false])), 'bootstrap-error');
    if (statusElement) statusElement.textContent = 'Optional integrations are unavailable. Essential site features remain available.';
    emit('bootstrap-error');
  });
  emit('bootstrap-requested');
  timer = win.setTimeout(() => {if (!disposed && !api()) emit('consent-api-timeout');}, options.loaderTimeoutMs);
  doc.head.append(script); refresh();
  return handle;
}
