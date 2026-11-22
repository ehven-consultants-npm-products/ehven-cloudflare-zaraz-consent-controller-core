# API and contracts

The root export contains `defineConfig`, `browserOptions`,
`buildZarazConfiguration` and `scopeAllows`. Browser and Fetch/server helpers have
separate `/browser` and `/server` exports. No CommonJS interface is promised.

## Declarative configuration example

This disposable example renders optional local content using native Custom HTML.
It is not a tool added merely to make a consent purpose visible. Replace it with
the reviewed integration required by your application before deployment.

```js
import {defineConfig, browserOptions, buildZarazConfiguration}
  from '@ehven/cloudflare-zaraz-consent-controller-core';

const config = defineConfig({
  enabled: true,
  origin: 'https://your-site.example',
  paths: ['/example/'],
  privateRoots: ['/account'],
  purposes: {content: {name: 'Optional content', description: 'Show optional example content.'}},
  tools: {
    ExampleContent: {
      type: 'component', component: 'html', name: 'Optional example content',
      defaultPurpose: 'content', permissions: ['execute_unsafe_scripts'], settings: {},
      actions: {Show: {actionType: 'event', firingTriggers: ['Pageview'],
        data: {htmlCode: '<p>Optional content is enabled.</p>'}}},
    },
  },
});
const plan = buildZarazConfiguration({}, config); // inspect and deploy separately
const publicConfig = browserOptions(config); // serialize this projection only
```

The native Custom HTML permission does not imply changing the site's CSP. Native
component identifiers and vendor settings remain subject to Cloudflare's API.
Core validates structure and policy references, not every vendor's complete schema.

## Options

| Option | Default and behavior |
|---|---|
| `enabled` | `false`; controls the browser/host gate, not remote publication |
| `origin` | Required exact HTTPS origin, no credentials or trailing slash |
| `paths` | `[]`; exact canonical pathnames, maximum 1,000 |
| `privateRoots` | `[]`; root and descendants excluded, even if listed in paths |
| `purposes` | `{}`; purpose IDs mapped to name/description |
| `tools` | `{}`; native tool entries, maximum 100 |
| `triggers` | `{}` plus default `Pageview`; all generated triggers receive scope gates |
| `operator` | Configured hostname |
| `cookieName` | `cf_consent`; changing it deliberately can require fresh choices |
| `language` | `en`; localized fields require this language |
| `intro` | Plain text, or language-to-text map; HTML escaped |
| `privacyUrl` | Optional HTTPS URL, resolved against origin |
| `loaderTimeoutMs` | 10,000; integer from 100 to 60,000 |
| `reloadOnWithdrawal` | `true`; disable only with a tested host recovery policy |

Names/descriptions may be strings or language-to-text maps. IDs are alphanumeric,
1–64 characters. Declarative input is bounded to 256 KiB, depth 20 and 10,000
values. Getters, functions, non-finite values, sparse arrays, prototype keys,
unsupported top-level fields and ambiguous paths are rejected with TypeError.
Configuration is copied and recursively frozen. No config file scanning, implicit
execution or environment-variable overrides take place. Explicit application
composition determines precedence before calling `defineConfig`.

Native tools must have declared purposes even while disabled. Actions need explicit
firing triggers; references must exist. Unused purposes are omitted from the native
modal. Origin/path/query rules are added to every generated trigger. Browser scope
also rejects fragments and private same-origin referrers. A native plan with no
enabled tools has no triggers and disables CMP; no dummy tools are inserted.

Base configuration must have no existing tools/triggers. Other base fields are
preserved except the settings intentionally owned by the builder: manual/iframe
injection, privacy defaults, cookie hostname, consent, data-layer/history modes and
Zaraz monitoring. Native monitoring is disabled; downstream measurement is explicit.
Use a separately reviewed migration for an existing installation. A generated plan
does not establish native acceptance or changes to the published service state.

## Browser installation

```js
import {installConsentController}
  from '@ehven/cloudflare-zaraz-consent-controller-core/browser';

const controller = installConsentController(publicConfig, {
  settingsElement: document.querySelector('[data-consent-settings]'),
  statusElement: document.querySelector('[data-consent-status]'),
});
controller.openSettings(); // false when unavailable/ineligible
controller.track('OpenContent', {kind: 'example'}, 'content'); // consent-gated
// Later: controller.destroy();
```

The controller does not construct its own modal. Default selector hooks are optional
button/status elements. Native CMP keyboard/focus/contrast behavior still needs
host acceptance. `onState(snapshot)` receives fixed status and boolean choices;
`onChoices(choices)` runs on initial readiness and changes. No cookie/token values
or exception messages enter those diagnostics. Observers cannot interrupt cleanup.

`getSnapshot()` and `refresh()` return `{state, ready, choices}`. Startup is idle,
ineligible, existing-loader, bootstrap-requested/loaded/error, consent-api-timeout,
consent-api-error or consent-ready. Bootstrap HTTP success is not native readiness.
Connector/dispatch errors have fixed states. `destroy()` is idempotent and ends in
disposed state. After disposal, callbacks/listeners stop. Native SDKs may remain.

`track(name, properties, purpose)` returns false unless the current page and purpose
are eligible, native consent is ready and affirmative, and the native method exists.
Invalid arguments throw TypeError. Payloads are bounded plain JSON objects, 16 KiB.
The caller must use an explicit safe event schema; the core cannot identify arbitrary
personal data within custom strings. Never pass raw query strings, form fields,
visitor tokens or identity into generic events. Other native tools still enforce
their own purpose assignments; dispatch is not a substitute for those mappings.

`formContexts` optionally declares `{purpose, selector, consentField, pageField,
marker}` bindings at installation. The shared capture listener adds only granted
consent and the eligible origin/path to matching forms. Defaults are `consent`,
`sourcePage`, and `data-consent-context`. Each binding needs a distinct ownership
marker. Existing package-owned hidden fields are removed before reevaluation;
ordinary form values are neither read nor exported. Essential submission is not
prevented. The host still performs server-side consent, identity and abuse checks.

## Optional connectors

Pass `connectors` at installation. A connector supplies `id`, `purpose`, optional
`cookies`, synchronous `onConsentChange` and `onDispose`. IDs must be unique.
`onConsentChange` receives `{purpose, granted, previousGranted, reason}`. Hooks run
on initial state/change, before a withdrawal reload. Async hooks are unsupported:
their returned promises are observed to avoid unhandled rejections and reported as
connector-error; they are not awaited. Hook failures cannot authorize a purpose.

Cookie descriptors contain `name`, `purpose`, optional `path` (default `/`), optional
`domain` (exact configured hostname only), and `httpOnly` (default false). Include
separate host-only and domain descriptors when both are owned. Browser cleanup
skips HttpOnly cookies; a server hook handles those. Consent cookie deletion and
other-host/parent-domain cleanup are rejected. The declaration is an ownership
assertion supplied by the integrator, not automatic storage classification.

## Server helpers

- `readRequestCookie(request, name)`: returns a unique bounded cookie value or
  undefined. Duplicate names and values over 4,096 characters fail closed.
- `readStoredChoices(request, publicConfig)`: reads configured native purpose
  booleans; malformed storage returns an empty map. Cookie metadata is untrusted.
- `submissionConsentGranted(request, formData, publicConfig, fields)`: checks
  same-origin POST, fetch context, GPC/DNT, stored and submitted purpose consent,
  and an eligible source page. `fields` requires `purpose`; `consentField` defaults
  to `consent`, `pageField` to `sourcePage`. Submitted consent must equal `granted`.
  Returns boolean; it is not authorization or validated provider identity.
- `expireCookiesAfterWithdrawal(request, response, publicConfig, descriptors)`:
  expires only declared present cookies when their consent is absent/denied on
  eligible 200 responses. Preserves body, status and unrelated headers/cookies;
  modified responses use no-store. Returns the original response when unchanged.

Host routing, authentication, abuse prevention, provider identity validation and
message delivery are separate responsibilities. Missing optional association must
not block essential forms. Do not expose cookie-reading results through diagnostics.

## Build and size

The browser export is a bundled, minified ES module built with the pinned esbuild
development dependency. Readable implementation remains in `src/`; no runtime
dependency or source map is added. `npm run check` builds and verifies a 12 KiB
uncompressed delivered-module limit and a separate 20 KiB readable source-graph
limit. These limits exclude native CMP/provider transfers and do not establish
LCP/CLS/INP acceptance. Installed-candidate and actual host measurements remain
separate from source checks.

## Service references

- [Native consent](https://developers.cloudflare.com/zaraz/consent-management/)
- [Consent API](https://developers.cloudflare.com/zaraz/consent-management/api/)
- [Manual loading](https://developers.cloudflare.com/zaraz/advanced/load-zaraz-manually/)
- [Properties](https://developers.cloudflare.com/zaraz/reference/properties-reference/)
