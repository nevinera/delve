// Asks Build::ClassTtdSimsController how the class survives the reference
// pulls from docs/combat_balance.md, once per stat priority and elevation,
// running the caller-authored strategy (see issue #135). Takes the *resolved*
// class (see resolveFullClass.js) and a strategy array - the same inputs as
// estimateClassDps. Resolves to {results: [...]}, or throws an Error carrying
// the server's message.
function csrfToken() {
  return document.querySelector('meta[name="csrf-token"]')?.content;
}

export async function estimateClassTtd(fullClass, strategy) {
  const res = await fetch("/build/class_ttd_sims/character_class", {
    method: "POST",
    headers: {"Content-Type": "application/json", "X-CSRF-Token": csrfToken()},
    body: JSON.stringify({class: fullClass, strategy}),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Estimate failed (${res.status})`);
  return body;
}
