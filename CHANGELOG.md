# Changelog

## Unreleased

- Make disposal safe when a connector or observer calls it again, and preserve restored host UI when disposal occurs during consent updates.
- Honor startup cancellation before creating a bootstrap request or timer.

## 0.1.0 — development candidate

- Provider-neutral native-tool configuration with explicit purpose and trigger references.
- Exact page scope, public browser projection and manual Zaraz bootstrap lifecycle.
- Consent-gated events, connector hooks and declared browser/server cookie cleanup.
- Native match, click, timer, form, variable, scroll and visibility trigger rules.
- No bundled providers, automatic activation or runtime npm dependencies.
