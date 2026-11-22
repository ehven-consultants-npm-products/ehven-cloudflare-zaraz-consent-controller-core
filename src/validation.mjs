/** Bounds apply to caller-supplied declarative configuration, not vendor schemas. */
export function fail(message) { throw new TypeError(message); }
export function record(value, label) {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`${label} must be a plain object.`);
  return value;
}
export function keys(value, allowed, label) {
  record(value, label);
  if (Reflect.ownKeys(value).some(key => typeof key !== 'string' || !allowed.includes(key))) fail(`${label} contains an unsupported field.`);
}
export function text(value, label, max = 2048) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) fail(`${label} must be bounded, nonempty text without control characters.`);
  return value;
}
export function identifier(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9]{1,64}$/.test(value) || ['__proto__', 'constructor', 'prototype'].includes(value)) fail(`${label} must be an alphanumeric ID of at most 64 characters.`);
  return value;
}
export function cookieName(value) {
  if (typeof value !== 'string' || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}$/.test(value)) fail('Invalid cookie name.');
  return value;
}
export function jsonData(value, label = 'data', limit = 262144) {
  let nodes = 0;
  const visit = (item, depth) => {
    if (++nodes > 10000 || depth > 20) fail(`${label} exceeds structural limits.`);
    if (item === null || typeof item === 'boolean' || typeof item === 'string') return;
    if (typeof item === 'number' && Number.isFinite(item)) return;
    if (Array.isArray(item)) {
      if (item.length > 10000 || Object.keys(item).length !== item.length) fail(`${label} contains a sparse or oversized array.`);
      for (let i = 0; i < item.length; i++) {
        const descriptor = Object.getOwnPropertyDescriptor(item, String(i));
        if (!descriptor || !('value' in descriptor)) fail(`${label} must contain data properties only.`);
        visit(descriptor.value, depth + 1);
      }
      return;
    }
    record(item, label);
    for (const key of Reflect.ownKeys(item)) {
      if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key)) fail(`${label} contains an unsafe key.`);
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (!descriptor.enumerable || !('value' in descriptor)) fail(`${label} must contain data properties only.`);
      visit(descriptor.value, depth + 1);
    }
  };
  visit(value, 0);
  const serialized = JSON.stringify(value);
  if (new TextEncoder().encode(serialized).length > limit) fail(`${label} exceeds its byte limit.`);
  return JSON.parse(serialized);
}
export function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
export function origin(value) {
  text(value, 'origin');
  let url; try { url = new URL(value); } catch { fail('origin must be an exact HTTPS origin.'); }
  if (url.protocol !== 'https:' || url.origin !== value || url.username || url.password) fail('origin must be an exact HTTPS origin without credentials or a trailing slash.');
  return value;
}
export function path(value, label = 'path') {
  text(value, label);
  if (!value.startsWith('/') || /[?#\\\s]/u.test(value) || /%(?:2f|5c|25|2e)/i.test(value)) fail(`${label} must be an unambiguous absolute pathname.`);
  const url = new URL(value, 'https://scope.invalid');
  if (url.origin !== 'https://scope.invalid' || url.pathname !== value || value.includes('//')) fail(`${label} must be a canonical pathname.`);
  return value;
}
export const escapeHtml = value => value.replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));
