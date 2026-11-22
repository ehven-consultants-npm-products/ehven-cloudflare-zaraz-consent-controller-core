import {defineConfig, browserOptions, buildZarazConfiguration, scopeAllows, type ConfigInput} from '@ehven/cloudflare-zaraz-consent-controller-core';
import {installConsentController, type Connector} from '@ehven/cloudflare-zaraz-consent-controller-core/browser';
import {submissionConsentGranted, expireCookiesAfterWithdrawal} from '@ehven/cloudflare-zaraz-consent-controller-core/server';
const input: ConfigInput = {origin: 'https://example.test', purposes: {}, tools: {}};
const config = defineConfig(input);
const options = browserOptions(config);
buildZarazConfiguration({}, config);
scopeAllows('https://example.test', config);
const connector: Connector = {id: 'Example', purpose: 'content', onConsentChange(change) {const value: boolean = change.granted; void value;}};
const controller = installConsentController(options, {connectors: [connector], onState(snapshot) {const value: boolean = snapshot.ready; void value;}});
controller.track('Open', {kind: 'example'}, 'content'); controller.destroy();
const request = new Request('https://example.test');
submissionConsentGranted(request, new FormData(), options, {purpose: 'content'});
expireCookiesAfterWithdrawal(request, new Response(), options, []);
// @ts-expect-error origin is required
defineConfig({enabled: true});
// @ts-expect-error the browser receives only the public projection
installConsentController(config);
