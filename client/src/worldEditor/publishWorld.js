// Asks Rails (Build::WorldsController#publish) to tag the repo's saved
// world and import it as a new, unreleased world version. Resolves to
// {url} (the world's versions page) or throws with Rails' error message.
function csrfToken() {
  return document.querySelector('meta[name="csrf-token"]')?.content;
}

// The new world editor also passes {branch, expectedSha}: publish that
// branch, and only if its head is still the commit the editor expanded.
export async function publishWorld(publishUrl, tag, {branch, expectedSha} = {}) {
  const res = await fetch(publishUrl, {
    method: "POST",
    headers: {"Content-Type": "application/json", "X-CSRF-Token": csrfToken()},
    body: JSON.stringify(branch ? {tag, branch, expected_sha: expectedSha} : {tag}),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Publish failed (HTTP ${res.status})`);
  return body;
}
