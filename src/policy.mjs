/** Scope is explicit. Configuration must be validated before installing a controller. */
export function scopeAllows(value, config, privacy = {}) {
  try {
    const url = new URL(value);
    const decodedPath = decodeURIComponent(url.pathname);
    return config.enabled === true && url.protocol === 'https:' && url.origin === config.origin
      && !url.username && !url.password && !url.search && !url.hash
      && config.paths.includes(url.pathname)
      && !(config.privateRoots ?? []).some(root => {
        const decodedRoot = decodeURIComponent(root);
        return decodedRoot === '/' || decodedPath === decodedRoot || decodedPath.startsWith(`${decodedRoot}/`);
      })
      && privacy.globalPrivacyControl !== true && privacy.doNotTrack !== '1';
  } catch { return false; }
}
export function requestPrivacyDenied(request) {
  return request.headers.get('Sec-GPC') === '1' || request.headers.get('DNT') === '1';
}
export function sameOriginPost(request, config) {
  try {
    return request.method === 'POST' && new URL(request.url).origin === config.origin
      && request.headers.get('Origin') === config.origin
      && !['cross-site', 'none'].includes(request.headers.get('Sec-Fetch-Site'));
  } catch { return false; }
}
