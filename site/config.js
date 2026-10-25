// The Convex deployment the website talks to (delete-account sign-in). Public, not a secret.
// Dev (silent-otter-909) until the production deployment exists; then point this at prod.
window.GROCR_CONFIG = {
  convexUrl: 'https://silent-otter-909.eu-west-1.convex.cloud',
  appleServicesId: 'io.grocr.web',
  // Must match the redirect the backend allows and Apple's registered return URL.
  redirectUrl: 'https://grocr.io/delete-account',
};
