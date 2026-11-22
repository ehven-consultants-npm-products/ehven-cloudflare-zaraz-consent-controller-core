import {cookieName, fail, jsonData, keys, path} from './validation.mjs';

/** Cookie ownership is supplied explicitly by the integration, never discovered. */
export function cookieDescriptors(values, config) {
  if (!Array.isArray(values) || values.length > 100) fail('cookies must be a bounded array.');
  return values.map(input => {
    const item = jsonData(input);
    keys(item, ['name', 'path', 'domain', 'purpose', 'httpOnly'], 'cookie descriptor');
    cookieName(item.name);
    if (item.name === config.cookieName) fail('Provider cleanup cannot delete the consent cookie.');
    if (!config.purposeIds.includes(item.purpose)) fail('Cookie cleanup requires a configured purpose.');
    item.path = path(item.path ?? '/', 'cookie path');
    if (!/^[\x21-\x7e]+$/.test(item.path) || /[;,]/.test(item.path)) fail('Invalid cookie path.');
    if (item.domain !== undefined && item.domain !== new URL(config.origin).hostname) fail('Cookie domain must be the exact configured hostname; omit it for host-only storage.');
    item.httpOnly ??= false;
    if (typeof item.httpOnly !== 'boolean') fail('httpOnly must be boolean.');
    if (item.name.startsWith('__Host-') && (item.domain || item.path !== '/')) fail('__Host- cookies require host-only scope and Path=/.');
    return item;
  });
}
export function cookieExpiry(item) {
  return `${item.name}=; Max-Age=0; Path=${item.path}; Secure; SameSite=Lax${item.domain ? `; Domain=${item.domain}` : ''}${item.httpOnly ? '; HttpOnly' : ''}`;
}
