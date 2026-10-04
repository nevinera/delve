// Asks Rails (Build::ClassesController#publish) to tag the class's commit
// as "<key>-<version>" and register it as a playable class version.
// Resolves to {identifier, version} or throws with Rails' error message.
function csrfToken() {
  return document.querySelector('meta[name="csrf-token"]')?.content;
}

// expectedSha: the commit the editor last loaded or saved - Rails refuses if
// the branch has moved on since.
export async function publishClass(publishUrl, version, {branch, expectedSha}) {
  const res = await fetch(publishUrl, {
    method: "POST",
    headers: {"Content-Type": "application/json", "X-CSRF-Token": csrfToken()},
    body: JSON.stringify({version, branch, expected_sha: expectedSha}),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Publish failed (HTTP ${res.status})`);
  return body;
}
