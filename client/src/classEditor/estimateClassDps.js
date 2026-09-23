// Asks Build::ClassDpsSimsController for the class's estimated DPS across
// every (duration x elevation) cell, running the caller-authored strategy
// (see issue #75). Takes the *resolved* class (see resolveFullClass.js) and
// a strategy array - same shape as classdps.Strategy's JSON tags
// ({power, condition: {type, on, status}}). Resolves to the {results: [...]}
// matrix, or throws an Error carrying the server's message.
function csrfToken() {
  return document.querySelector('meta[name="csrf-token"]')?.content;
}

export async function estimateClassDps(fullClass, strategy) {
  const res = await fetch("/build/class_dps_sims/character_class", {
    method: "POST",
    headers: {"Content-Type": "application/json", "X-CSRF-Token": csrfToken()},
    body: JSON.stringify({class: fullClass, strategy}),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Estimate failed (${res.status})`);
  return body;
}
