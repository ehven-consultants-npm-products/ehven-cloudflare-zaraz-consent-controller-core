# Cloudflare Zaraz consent controller core

Provider-neutral configuration and consent lifecycle for Cloudflare Zaraz. Native
tools are supplied as declarative configuration. Optional connectors supply
provider recipes or custom behavior; framework adapters supply rendering/bindings.
No provider is bundled or activated. No runtime npm dependencies.

Install the core in the host project:

```sh
npm install @ehven/cloudflare-zaraz-consent-controller-core
```

Node.js 24+ is required for the documented server/configuration path. Browser
installation uses modern ES modules and native DOM APIs. Native Cloudflare
configuration and browser compatibility require acceptance in the intended host;
local mocks do not establish vendor ingestion or account setup.

## First use

Keep application choices outside the dependency, for example in
`config/packages/npm/cloudflare-zaraz-consent-controller-core/index.mjs`:

```js
import {defineConfig} from '@ehven/cloudflare-zaraz-consent-controller-core';

export default defineConfig({
  enabled: false,
  origin: 'https://your-site.example',
  paths: ['/', '/privacy/'],
  privateRoots: ['/account'],
  operator: 'Your organization',
  privacyUrl: '/privacy/',
  purposes: {},
  tools: {},
});
```

An empty configuration is intentionally idle: no loader, dummy tool or empty
consent modal. Use `buildZarazConfiguration({}, config)` to inspect a native plan
without making any network call. Add reviewed native tools and their purposes
before setting `enabled: true`.

Every tool supplies its native `type`, `component`, `name`, `defaultPurpose` and
explicit `actions`. Every action references configured firing triggers. A default
`Pageview` trigger is available. Connector packages are optional: ordinary native
tools can be configured directly. See [the API reference](docs/api.md) for a complete
synthetic example and configuration rules.

On the server/build side, call `browserOptions(config)` to obtain the deliberately
small public projection. Only serialize that projection to HTML. Keep native tool
settings and secrets server-side; this projection is not a secret scanner.

In a browser entrypoint, import `installConsentController` from the package's
`/browser` export and pass that projection. Installation returns `refresh()`,
`openSettings()`, `track()` and `destroy()`. Importing any entrypoint performs no
loading, tracking, infrastructure change or automatic initialization.

## Native setup and boundaries

Use a reviewed Cloudflare Zaraz configuration and turn off automatic injection.
The controller owns the one manual `/cdn-cgi/zaraz/i.js` bootstrap on eligible
pages. The plan builder never uploads, publishes or activates a native plan.
It refuses existing tools/triggers rather than silently replacing them.

The native CMP remains the consent authority. Optional tools require an explicit
configured purpose. The controller restricts its own operation to exact HTTPS
origin/path inventory, excludes private roots and query/fragment URLs, and honors
GPC/DNT. A private same-origin referrer also blocks startup. No generic data layer,
automatic form scraping, identity collection or provider telemetry is included.

Independently injected scripts, existing managers, server integrations and external
embeds remain the application's responsibility. This package is neither a universal
auto-blocker nor a compliance certification. Cloudflare/Zaraz remains a service
dependency even though the package has no runtime npm dependencies.

## Lifecycle and recovery

Repeated installation with identical options, connector instances and bindings
returns the installed controller. A conflicting installation is rejected. Foreign
loaders are not adopted. Consent loss runs declared connector cleanup and reloads
the document by default because removing script elements cannot unload an SDK.
Disabling reload is an explicit host responsibility.

`destroy()` removes owned listeners/timers/script and restores bound UI state;
it does not revoke saved choices, unload already running SDKs or erase historical
provider records. Reload after disabling the host integration and, when necessary,
roll back its reviewed native configuration. Cookie deletion is exact declared
scope, not a universal storage eraser. Full-page navigation is the initial model;
hosts with client-side navigation must coordinate lifecycle and recheck scope.

## Support

Report reproducible issues through this repository's issue tracker. Include the
package version, runtime/host, expected behavior and a synthetic reproduction.
Never include cookie values, access tokens, identities or private form contents.
For sensitive reports, use repository private vulnerability reporting when available.
If unavailable, request a private reporting channel without posting vulnerability
details or credentials. Support is best effort; no service level is implied.

Before 1.0, minor versions may change contracts; patch versions are intended for
compatible corrections. Published versions are immutable. Review native behavior
after relevant service/configuration changes independently of npm updates.

Support continued development through [Ehven Consultants](https://ehven.com/contact/).
