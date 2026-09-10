// Checks a draft against Build::ValidatorsController, which wraps the same
// Ruby Validators::* classes the server already requires for
// FetchAbilityContentJob/FetchCharacterClassContentJob - rather than
// re-implementing that (constantly-changing) schema a second time in JS.
// Resolves to {valid: true} or {valid: false, error: {message, path}}.
function csrfToken() {
  return document.querySelector('meta[name="csrf-token"]')?.content;
}

async function postValidation(path, data) {
  const res = await fetch(path, {
    method: "POST",
    headers: {"Content-Type": "application/json", "X-CSRF-Token": csrfToken()},
    body: JSON.stringify(data),
  });
  return res.json();
}

export function validateAbility(ability) {
  return postValidation("/build/validators/ability", ability);
}
