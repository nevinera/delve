// Asks Rails to take the character out of the world now (freeing their
// game-server slot, so they can switch versions or re-enter straight away).
// Resolves { redirectUrl } on success or { error } on failure.
export async function leaveWorld(url) {
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
  try {
    const res = await fetch(url, {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      },
      credentials: "same-origin",
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) return { error: body?.error || "Couldn't leave the world." };
    return { redirectUrl: body.redirect_url };
  } catch {
    return { error: "Couldn't leave the world." };
  }
}
