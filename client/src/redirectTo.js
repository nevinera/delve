// Every editor's GithubAuthError handler needs to navigate the browser away
// (to GitHub's own reauth flow) - funneled through here so tests can mock
// this one module instead of stubbing window.location itself, which jsdom
// makes non-configurable (mock, spy, and defineProperty all throw
// "Cannot redefine property") once vitest runs each test file in a real vm
// context (pool: 'vmThreads' - see vitest.config.js).
export function redirectTo(url) {
  window.location.href = url;
}
