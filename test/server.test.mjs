import test from 'node:test';
import assert from 'node:assert/strict';
import {readRequestCookie, readStoredChoices, submissionConsentGranted, expireCookiesAfterWithdrawal} from '../src/server.mjs';
import {publicOptions} from './fixtures.mjs';

const options = publicOptions();
const request = ({choices = {media: true}, headers = {}, url = options.origin + '/', method = 'POST', cookie = `fixture_consent=${encodeURIComponent(JSON.stringify(choices))}; sample_provider=packed; CF_Authorization=untouched`} = {}) => new Request(url, {method, headers: {Origin: options.origin, Cookie: cookie, ...headers}});
const form = () => {const data = new FormData(); data.set('consent', 'granted'); data.set('sourcePage', options.origin + '/'); return data;};
test('server consent enforces origin, declared purpose, privacy, scope and matching choices', () => {
  assert.equal(submissionConsentGranted(request(), form(), options, {purpose: 'media'}), true);
  for (const input of [{choices: {media: false}}, {headers: {Origin: 'https://outside.example'}}, {headers: {'Sec-Fetch-Site': 'cross-site'}}, {headers: {'Sec-GPC': '1'}}, {headers: {DNT: '1'}}, {method: 'GET'}, {cookie: 'fixture_consent=broken'}, {cookie: 'fixture_consent={}; fixture_consent={}'}]) assert.equal(submissionConsentGranted(request(input), form(), options, {purpose: 'media'}), false);
  assert.equal(submissionConsentGranted(request(), form(), options, {purpose: 'unknown'}), false);
  for (const value of [options.origin + '/private/example/', options.origin + '/?private=1']) {const data = form(); data.set('sourcePage', value); assert.equal(submissionConsentGranted(request(), data, options, {purpose: 'media'}), false);}
  assert.equal(submissionConsentGranted(request(), form(), {...options, enabled: false}, {purpose: 'media'}), false);
});
test('cookie parsing rejects ambiguity and never treats unknown purposes as granted', () => {
  assert.equal(readRequestCookie(request({cookie: 'x=a; x=b'}), 'x'), undefined);
  assert.equal(readRequestCookie(request({cookie: `x=${'x'.repeat(4097)}`}), 'x'), undefined);
  assert.deepEqual(readStoredChoices(request({choices: {media: 'true'}}), options), {media: false, metrics: false});
  for (const choices of [null, [], 'true', {'__proto__': 'x'}]) assert.equal(readStoredChoices(request({choices}), options).media === true, false);
});
test('server withdrawal expires only declared provider storage and preserves response body and cookies', async () => {
  const cookies = [{name: 'sample_provider', purpose: 'media', httpOnly: true}];
  const response = new Response('page', {headers: {'Set-Cookie': 'unrelated=keep; HttpOnly', 'X-Example': 'keep'}});
  const result = expireCookiesAfterWithdrawal(request({choices: {media: false}}), response, options, cookies);
  assert.equal(await result.text(), 'page'); assert.equal(result.headers.get('X-Example'), 'keep');
  assert.equal(result.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(result.headers.getSetCookie(), ['unrelated=keep; HttpOnly', 'sample_provider=; Max-Age=0; Path=/; Secure; SameSite=Lax; HttpOnly']);
  const intact = new Response('same');
  assert.equal(expireCookiesAfterWithdrawal(request(), intact, options, cookies), intact);
  assert.equal(expireCookiesAfterWithdrawal(request({choices: {media: false}, url: options.origin + '/private/example/'}), intact, options, cookies), intact);
  assert.equal(expireCookiesAfterWithdrawal(request({headers: {'Sec-GPC': '1'}}), intact, options, cookies).headers.getSetCookie().length, 1);
});
test('cookie declarations cannot expand cleanup to consent, other purposes, hosts or injected header fields', () => {
  const invalid = [{name: 'fixture_consent', purpose: 'media'}, {name: 'x', purpose: 'missing'}, {name: 'x', purpose: 'media', domain: 'outside.example'}, {name: 'x', purpose: 'media', path: '/;bad'}, {name: 'x\r\nBad', purpose: 'media'}, {name: '__Host-example', purpose: 'media', domain: 'fixture.example'}];
  for (const cookie of invalid) assert.throws(() => expireCookiesAfterWithdrawal(request(), new Response('same'), options, [cookie]), TypeError);
});
