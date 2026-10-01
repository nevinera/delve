// Fetches a content file (zone or class JSON) and, given the SHA1 Rails
// recorded when it validated that file, refuses it if the bytes differ -
// the client must render exactly what the game server was handed.
export class ContentChecksumError extends Error {}

async function sha1Hex(buffer) {
  const digest = await crypto.subtle.digest("SHA-1", buffer);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function fetchVerifiedJson(url, expectedSha) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  // Hash the raw bytes (as Rails does), not re-encoded text.
  const buffer = await res.arrayBuffer();
  if (expectedSha) {
    const actualSha = await sha1Hex(buffer);
    if (actualSha !== expectedSha) {
      throw new ContentChecksumError(`${url} has changed since it was checked (expected ${expectedSha}, got ${actualSha})`);
    }
  }
  return JSON.parse(new TextDecoder().decode(buffer));
}
