import { SPEC_LEVEL, allowedBuild, offeredTalents } from "./build.js";

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

const choice = (item, on, pick) => {
  const button = el("button", { type: "button", className: on ? "play-build-on" : "" }, el("strong", { textContent: item.name ?? item.id }));
  if (item.description) button.append(el("span", { textContent: item.description }));
  button.addEventListener("click", pick);
  return button;
};

// Fills `box` with the specializations and talents this character can pick, and calls onChange
// with the build asked for. The server says what it comes to, and this draws again then. `refused`
// is why it said no to the last one.
export function drawBuildPanel(box, { made, level, build, refused }, onChange) {
  const close = el("button", { type: "button", className: "play-build-close", textContent: "close" });
  close.addEventListener("click", () => (box.hidden = true));
  box.replaceChildren(el("h2", { textContent: "Specialization and talents" }), close);
  if (refused) box.append(el("p", { className: "play-build-refused", textContent: refused }));
  if (level < SPEC_LEVEL) box.append(el("p", { textContent: `You choose a specialization at level ${SPEC_LEVEL}.` }));
  else {
    box.append(el("h3", { textContent: "Specialization" }));
    for (const spec of made.specializations ?? []) {
      box.append(choice(spec, build.specialization === spec.id, () => onChange(allowedBuild(made, { ...build, specialization: spec.id }, level))));
    }
  }
  let above = "";
  for (const tier of Object.keys(made.talents ?? {}).sort((a, b) => Number(a) - Number(b))) {
    if (Number(tier) > level) break;
    box.append(el("h3", { textContent: `Level ${tier} talent` }));
    for (const talent of offeredTalents(made, tier, build.specialization, above)) {
      box.append(choice(talent, build.talents[tier] === talent.id, () => onChange(allowedBuild(made, { ...build, talents: { ...build.talents, [tier]: talent.id } }, level))));
    }
    above = build.talents[tier] ?? "";
  }
}
