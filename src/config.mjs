import {cookieName, escapeHtml, fail, freeze, identifier, jsonData, keys, origin, path, record, text} from './validation.mjs';
import {scopeAllows} from './policy.mjs';

const own = (object, key) => Object.hasOwn(object, key);
const languagePattern = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
function localized(value, language, label) {
  if (typeof value === 'string') return {[language]: text(value, label)};
  record(value, label);
  const result = {};
  for (const [key, translation] of Object.entries(value)) {
    if (!languagePattern.test(key)) fail(`${label} has an invalid language.`);
    result[key] = text(translation, label);
  }
  if (!own(result, language)) fail(`${label} requires the default language.`);
  return result;
}
function refs(value, triggers, label) {
  if (!Array.isArray(value) || value.some(id => !own(triggers, id))) fail(`${label} must reference configured triggers.`);
}
function nativeRule(rule) {
  record(rule, 'trigger rule'); identifier(rule.id, 'rule ID');
  if (rule.id.startsWith('EhvenScope')) fail('EhvenScope rule IDs are reserved.');
  if (rule.action === undefined) {
    for (const field of ['match', 'op']) text(rule[field], 'rule field');
    if (!['CONTAINS', 'EQUALS', 'STARTS_WITH', 'ENDS_WITH', 'MATCH_REGEX', 'NOT_MATCH_REGEX', 'GREATER_THAN', 'GREATER_THAN_OR_EQUAL', 'LESS_THAN', 'LESS_THAN_OR_EQUAL'].includes(rule.op)
      || typeof rule.value !== 'string') fail('Invalid native match rule.');
    return;
  }
  const settings = record(rule.settings, 'native rule settings');
  const integer = (value, minimum) => Number.isSafeInteger(value) && value >= minimum;
  const selector = () => text(settings.selector, 'native selector');
  switch (rule.action) {
    case 'clickListener':
      selector();
      if (!['css', 'xpath'].includes(settings.type) || !integer(settings.waitForTags, 0)) fail('Invalid click listener settings.');
      break;
    case 'timer':
      if (!integer(settings.interval, 50) || !integer(settings.limit, 0)) fail('Invalid timer settings.');
      break;
    case 'formSubmission':
      selector(); if (typeof settings.validate !== 'boolean') fail('Invalid form submission settings.');
      break;
    case 'variableMatch':
      text(settings.variable, 'native variable'); text(settings.match, 'native variable match');
      break;
    case 'scrollDepth': text(settings.positions, 'native scroll positions'); break;
    case 'elementVisibility': selector(); break;
    default: fail('Unsupported native trigger rule action.');
  }
}
export function defineConfig(input) {
  // Copy only plain JSON data; functions/getters/prototype keys are never executed.
  const config = jsonData(input, 'configuration');
  keys(config, ['enabled', 'origin', 'paths', 'privateRoots', 'purposes', 'tools', 'triggers', 'operator', 'cookieName', 'language', 'intro', 'privacyUrl', 'loaderTimeoutMs', 'reloadOnWithdrawal'], 'configuration');
  config.enabled ??= false;
  if (typeof config.enabled !== 'boolean') fail('enabled must be boolean.');
  origin(config.origin);
  for (const key of ['paths', 'privateRoots']) {
    config[key] ??= [];
    if (!Array.isArray(config[key]) || config[key].length > 1000) fail(`${key} must be a bounded array.`);
    config[key].forEach(value => path(value, key));
    if (new Set(config[key]).size !== config[key].length) fail(`${key} contains duplicate paths.`);
  }
  config.language ??= 'en';
  if (!languagePattern.test(config.language)) fail('Invalid default language.');
  config.cookieName = cookieName(config.cookieName ?? 'cf_consent');
  config.operator = text(config.operator ?? new URL(config.origin).hostname, 'operator');
  config.intro = localized(config.intro ?? 'Choose which optional integrations may run.', config.language, 'intro');
  if (config.privacyUrl !== undefined) {
    const url = new URL(config.privacyUrl, config.origin);
    if (url.protocol !== 'https:' || url.username || url.password) fail('privacyUrl must resolve to a public HTTPS URL without credentials.');
    config.privacyUrl = url.href;
  }
  config.loaderTimeoutMs ??= 10000;
  if (!Number.isSafeInteger(config.loaderTimeoutMs) || config.loaderTimeoutMs < 100 || config.loaderTimeoutMs > 60000) fail('loaderTimeoutMs must be 100–60000 milliseconds.');
  config.reloadOnWithdrawal ??= true;
  if (typeof config.reloadOnWithdrawal !== 'boolean') fail('reloadOnWithdrawal must be boolean.');
  config.purposes ??= {}; config.tools ??= {}; config.triggers ??= {};
  for (const key of ['purposes', 'tools', 'triggers']) {
    record(config[key], key);
    if (Object.keys(config[key]).length > 100) fail(`${key} exceeds 100 entries.`);
  }
  for (const [id, purpose] of Object.entries(config.purposes)) {
    identifier(id, 'purpose ID'); keys(purpose, ['name', 'description'], 'purpose');
    purpose.name = localized(purpose.name, config.language, 'purpose name');
    purpose.description = localized(purpose.description, config.language, 'purpose description');
  }
  config.triggers.Pageview ??= {name: 'Configured public page', system: 'pageload', loadRules: [{id: 'event', match: '{{ client.__zarazTrack }}', op: 'EQUALS', value: 'Pageview'}], excludeRules: []};
  for (const [id, trigger] of Object.entries(config.triggers)) {
    identifier(id, 'trigger ID'); record(trigger, 'trigger');
    text(trigger.name, 'trigger name');
    for (const key of ['loadRules', 'excludeRules']) {
      trigger[key] ??= [];
      if (!Array.isArray(trigger[key]) || trigger[key].length > 100) fail('Trigger rules must be bounded arrays.');
      trigger[key].forEach(nativeRule);
      if (new Set(trigger[key].map(rule => rule.id)).size !== trigger[key].length) fail('Duplicate rule IDs.');
    }
  }
  for (const [id, tool] of Object.entries(config.tools)) {
    identifier(id, 'tool ID'); record(tool, 'native tool');
    text(tool.type, 'native tool type'); text(tool.component, 'native component'); text(tool.name, 'tool name');
    tool.enabled ??= true;
    if (typeof tool.enabled !== 'boolean') fail('tool.enabled must be boolean.');
    if (!own(config.purposes, tool.defaultPurpose)) fail('Every tool must reference a declared consent purpose.');
    tool.blockingTriggers ??= []; refs(tool.blockingTriggers, config.triggers, 'tool.blockingTriggers');
    record(tool.actions, 'tool.actions');
    if (!Object.keys(tool.actions).length) fail('A tool requires at least one explicit action.');
    for (const [actionId, action] of Object.entries(tool.actions)) {
      identifier(actionId, 'action ID'); record(action, 'action'); text(action.actionType, 'actionType');
      refs(action.firingTriggers, config.triggers, 'action.firingTriggers');
      if (!action.firingTriggers.length) fail('An action requires at least one firing trigger.');
      action.blockingTriggers ??= []; refs(action.blockingTriggers, config.triggers, 'action.blockingTriggers');
    }
  }
  const eligible = config.paths.filter(value => scopeAllows(config.origin + value, {...config, enabled: true}));
  if (Object.values(config.tools).some(tool => tool.enabled) && !eligible.length) fail('Enabled tools require an eligible public pathname.');
  return freeze(config);
}
/** Only scope and lifecycle options cross into HTML. Native tool settings stay server-side. */
export function browserOptions(input) {
  const config = defineConfig(input);
  return freeze({enabled: config.enabled, origin: config.origin, paths: config.paths, privateRoots: config.privateRoots,
    purposeIds: [...new Set(Object.values(config.tools).filter(tool => tool.enabled).map(tool => tool.defaultPurpose))],
    cookieName: config.cookieName, loaderTimeoutMs: config.loaderTimeoutMs, reloadOnWithdrawal: config.reloadOnWithdrawal});
}
/** Pure plan construction. No credentials, API calls, uploads or publication. */
export function buildZarazConfiguration(base, input) {
  const config = defineConfig(input), cleanBase = jsonData(base, 'base configuration');
  record(cleanBase, 'base configuration');
  for (const key of ['tools', 'triggers']) {
    if (cleanBase[key] !== undefined && Object.keys(record(cleanBase[key], key)).length) fail('Review existing tools and triggers before replacing native configuration.');
  }
  const active = new Set(Object.values(config.tools).filter(tool => tool.enabled).map(tool => tool.defaultPurpose));
  const purposes = {}, purposesWithTranslations = {};
  let order = 0;
  for (const [id, value] of Object.entries(config.purposes)) {
    if (!active.has(id)) continue;
    purposes[id] = {name: value.name[config.language], description: value.description[config.language]};
    purposesWithTranslations[id] = {...value, order: order++};
  }
  const paths = config.paths.filter(value => scopeAllows(config.origin + value, {...config, enabled: true}));
  const expression = `^(?:${paths.map(value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`;
  const gates = [
    {id: 'EhvenScopeOrigin', match: '{{ system.page.url.origin }}', op: 'EQUALS', value: config.origin},
    {id: 'EhvenScopePath', match: '{{ system.page.url.pathname }}', op: 'MATCH_REGEX', value: expression},
    {id: 'EhvenScopeQuery', match: '{{ system.page.url.search }}', op: 'EQUALS', value: ''},
  ];
  const triggers = Object.fromEntries(Object.entries(config.triggers).map(([id, trigger]) => [id, {...trigger, loadRules: [...trigger.loadRules, ...gates]}]));
  const introductions = Object.fromEntries(Object.entries(config.intro).map(([language, value]) => [language, `<p>${escapeHtml(value)}</p>${config.privacyUrl ? `<p><a href="${escapeHtml(config.privacyUrl)}">Privacy</a></p>` : ''}`]));
  return {...cleanBase, dataLayer: false, historyChange: false, analytics: {enabled: false},
    settings: {...cleanBase.settings, autoInjectScript: false, injectIframes: false, hideQueryParams: true, hideIPAddress: true, hideUserAgent: true, hideExternalReferer: true, cookieDomain: new URL(config.origin).hostname},
    consent: {enabled: active.size > 0, cookieName: config.cookieName, companyName: config.operator, defaultLanguage: config.language, hideModal: false,
      consentModalIntroHTML: introductions[config.language], consentModalIntroHTMLWithTranslations: introductions, purposes, purposesWithTranslations},
    tools: jsonData(config.tools), triggers: active.size ? triggers : {}};
}
