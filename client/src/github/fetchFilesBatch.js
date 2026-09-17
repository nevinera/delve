// Fetches many small text files' content in as few HTTP round-trips as
// possible - one GitHub GraphQL query per batch, aliasing every path in
// the batch as its own field, rather than one REST call per file (see
// plans/zone-editor.md's expander step). Used only by the zone editor's
// $ref expansion, where a zone can reference dozens of small map/
// unit_type/ability files at once - everything else in this codebase
// still uses the REST Contents API (Github::ContentClient server-side,
// commitFiles.js client-side for writes).
import {fetchToken} from "./token";

const GITHUB_GRAPHQL_API = "https://api.github.com/graphql";
// Keeps each query modestly sized rather than unbounded - a zone
// referencing more files than this fires multiple batches (in parallel),
// not one query with hundreds of aliased fields.
const MAX_BATCH_SIZE = 50;

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
  return chunks;
}

function buildQuery(owner, name, paths) {
  const fields = paths
    .map((path, i) => `f${i}: object(expression: ${JSON.stringify(`HEAD:${path}`)}) { ... on Blob { text } }`)
    .join("\n");
  return `query { repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { ${fields} } }`;
}

async function fetchBatch(token, owner, name, paths) {
  const res = await fetch(GITHUB_GRAPHQL_API, {
    method: "POST",
    headers: {Authorization: `Bearer ${token}`, "Content-Type": "application/json"},
    body: JSON.stringify({query: buildQuery(owner, name, paths)}),
  });
  if (!res.ok) throw new Error(`GitHub GraphQL error ${res.status}: ${res.statusText}`);
  const body = await res.json();
  if (body.errors?.length) throw new Error(`GitHub GraphQL error: ${body.errors.map((e) => e.message).join("; ")}`);

  const repository = body.data.repository;
  const results = {};
  paths.forEach((path, i) => {
    results[path] = repository[`f${i}`]?.text ?? null;
  });
  return results;
}

// Returns {path: content}, where content is the file's text, or null if
// it doesn't exist (a missing $ref target is a real content error worth
// surfacing to the caller, not something to silently paper over here).
export async function fetchFilesBatch(paths) {
  const uniquePaths = [...new Set(paths)];
  if (uniquePaths.length === 0) return {};

  const {token, repo_full_name: repo} = await fetchToken();
  const [owner, name] = repo.split("/");

  const batches = await Promise.all(chunk(uniquePaths, MAX_BATCH_SIZE).map((batch) => fetchBatch(token, owner, name, batch)));
  return Object.assign({}, ...batches);
}
