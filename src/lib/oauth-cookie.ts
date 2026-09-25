// Shared cookie scoping for the Discord OAuth CSRF state cookie.
//
// The portal answers on BOTH www.allfinancialfreedom.com and the apex domain
// with no canonical redirect between them, while the OAuth redirect_uri is
// built from a single fixed NEXTAUTH_URL. A host-only state cookie set on one
// hostname is never sent to the other, so the callback's CSRF check fails with
// `invalid_state` on every attempt for anyone who started on the "wrong" host.
// Deterministic, not flaky: those users can never connect.
//
// Scoping the cookie to the parent domain makes it valid on both hosts without
// touching the Discord app's registered redirect URIs. Only applied to
// allfinancialfreedom.com; preview deploys (*.vercel.app) and localhost keep a
// host-only cookie, which is correct there (a cross-site domain attribute would
// be rejected by the browser).
export function oauthCookieDomain(host: string | null | undefined): string | undefined {
  const h = (host ?? '').split(':')[0].toLowerCase()
  if (h === 'allfinancialfreedom.com' || h.endsWith('.allfinancialfreedom.com')) {
    return '.allfinancialfreedom.com'
  }
  return undefined
}
