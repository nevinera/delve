// Intentionally does nothing - Chrome's automatic "Install app" prompt
// (beforeinstallprompt) generally requires a registered service worker with
// a fetch handler, but this app's assets are already content-hashed (see
// vite.config.js) so there's no reason to add a caching layer on top of
// that. Not calling respondWith() here means every request just falls
// through to the network as if no service worker existed.
self.addEventListener("fetch", () => {});
