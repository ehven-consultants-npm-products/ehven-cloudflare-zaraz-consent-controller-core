import {cookieName, fail, jsonData} from './validation.mjs';
import {scopeAllows, requestPrivacyDenied, sameOriginPost} from './policy.mjs';
import {cookieDescriptors, cookieExpiry} from './cookies.mjs';

export function readRequestCookie(request, name) {
  cookieName(name);
  const matches = (request.headers.get('Cookie') ?? '').split(';').map(part => part.trim())
    .filter(part => part.startsWith(`${name}=`)).map(part => part.slice(name.length + 1));
  return matches.length === 1 && matches[0].length <= 4096 ? matches[0] : undefined;
}
export function readStoredChoices(request, options) {
  try {
    const raw = readRequestCookie(request, options.cookieName);
    if (raw === undefined) return {};
    const data = jsonData(JSON.parse(decodeURIComponent(raw)), 'stored consent', 4096);
    if (!data || Array.isArray(data) || typeof data !== 'object') return {};
    return Object.fromEntries(options.purposeIds.map(id => [id, data[id] === true]));
  } catch {return {};}
}
/** Consent metadata is not authenticated identity or authorization. */
export function submissionConsentGranted(request, formData, options, {purpose, consentField = 'consent', pageField = 'sourcePage'} = {}) {
  if (!options.purposeIds.includes(purpose)) return false;
  return sameOriginPost(request, options) && !requestPrivacyDenied(request)
    && formData?.get(consentField) === 'granted' && readStoredChoices(request, options)[purpose] === true
    && scopeAllows(formData.get(pageField), options);
}
/** Exact declared storage only. The caller remains responsible for routing/auth. */
export function expireCookiesAfterWithdrawal(request, response, options, cookies) {
  const descriptors = cookieDescriptors(cookies, options);
  if (!options.enabled || response.status !== 200 || !scopeAllows(request.url, options)) return response;
  const choices = readStoredChoices(request, options), denied = requestPrivacyDenied(request);
  const expired = descriptors.filter(cookie => (denied || choices[cookie.purpose] !== true) && readRequestCookie(request, cookie.name) !== undefined);
  if (!expired.length) return response;
  const headers = new Headers(response.headers);
  for (const item of expired) headers.append('Set-Cookie', cookieExpiry(item));
  headers.set('Cache-Control', 'no-store');
  return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
}
