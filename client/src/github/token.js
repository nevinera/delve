// Shared by every client-side GitHub call - commitFiles.js's writes, and
// fetchFilesBatch.js's reads. GET /github/token refreshes the token
// server-side as needed (see Github::ConnectionsController#token).

// Thrown when /github/token reports the user isn't connected, or needs to
// reauthorize - `redirectUrl` is where the caller should send them.
export class GithubAuthError extends Error {
  constructor(code, redirectUrl) {
    super(`GitHub authorization required (${code})`);
    this.name = "GithubAuthError";
    this.code = code;
    this.redirectUrl = redirectUrl;
  }
}

export async function fetchToken() {
  const res = await fetch("/github/token");
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new GithubAuthError(body.error ?? "not_connected", body.connect_url ?? body.reauth_url ?? null);
  }
  return res.json();
}
