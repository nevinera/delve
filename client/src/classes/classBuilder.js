import { addMastery, addResource, addSpecialization, armorOf, armorTypes, grantNewAbility, grantNewStatus, grantSpecStrip, MOST_RESOURCES, offhandStrip, primaryStrip, removeGrant, removeResource, removeSpecialization, requiresStrip, RESOURCE_KINDS, resourceKindStrip, resourceMaxStrip, resourceRegenStrip, settleStartingGear, startingOffhandStrip, startingWeaponStrip, toggleArmor, weaponStrip } from "./classChoices.js";
import { asStrip, choice, drawStrip, el, foldOutFields } from "./choiceStrip.js";
import { CLASS_SECTIONS, classFields, talentFields } from "./fields.js";
import { renderFields, renderSections, setKey } from "./form.js";
import { statusSummary } from "./statusChoices.js";

// The Class tab and a talent's form, as the ability form is: choices first, the rest folded away.

const numberOf = (text) => (text.trim() === "" ? undefined : Number(text));

const part = (title, ...children) => el("div", { className: "moment" }, el("div", { className: "moment-title", textContent: title }), ...children);

function removeButton(label, gone) {
  const button = el("button", { type: "button", textContent: "×", title: `remove ${label}`, className: "effect-remove" });
  button.setAttribute("aria-label", `remove ${label}`);
  button.addEventListener("click", gone);
  return button;
}

const addButton = (label, click) => {
  const button = el("button", { type: "button", className: "effect-add", textContent: label });
  button.addEventListener("click", click);
  return button;
};

function drawArmor(made, hooks) {
  const pieces = armorTypes().flatMap((type) => {
    const held = armorOf(made, type);
    const button = choice({ value: type, label: `${type[0].toUpperCase()}${type.slice(1)}` }, Boolean(held), () => {
      toggleArmor(made, type);
      hooks.reshaped();
    });
    if (!held) return [button];
    const input = el("input", { type: "number", min: 1, step: 1, className: "choice-other", value: held.level ?? 1 });
    input.setAttribute("aria-label", `level ${type} unlocks at`);
    input.addEventListener("input", () => {
      setKey(held, "level", numberOf(input.value));
      hooks.changed();
    });
    return [button, el("label", { className: "choice-other-box" }, "from level", input)];
  });
  return asStrip(el("div", { className: "choice-strip" }, ...pieces), "armor");
}

function drawResource(made, resource, hooks, fields) {
  const [name, color] = ["name", "color"].map((key) => fields.find((field) => field.key === key));
  const rest = foldOutFields(fields, { drop: ["name", "color", "kind", "max", "regen"], tuck: { key: "advanced" }, move: { decay: "advanced" } });
  const strip = (s) => (s ? [drawStrip(s, hooks)] : []);
  const card = el(
    "div",
    { className: "effect-card" },
    el(
      "div",
      { className: "effect-head class-card-head" },
      ...renderFields([{ ...name, placeholder: () => "name" }, color], resource, hooks),
      removeButton(resource.name || "this resource", () => {
        removeResource(made, resource);
        hooks.reshaped();
      }),
    ),
    ...strip(resourceKindStrip(resource)),
    ...strip(resourceMaxStrip(resource)),
    ...strip(resourceRegenStrip(resource)),
    ...renderFields(rest, resource, hooks),
  );
  card.dataset.resource = resource.key;
  return card;
}

function drawSpecialization(made, spec, hooks, fields) {
  const [name, description] = ["name", "description"].map((key) => fields.find((field) => field.key === key));
  const rest = foldOutFields(fields, { drop: ["name", "description"], tuck: { id: "advanced" }, move: { abilities: "advanced" } });
  const open = el("button", { type: "button", textContent: `its spellbook page (${spec.abilities?.length ?? 0})` });
  open.addEventListener("click", () => hooks.openPage(spec.id));
  const card = el(
    "div",
    { className: "effect-card" },
    el(
      "div",
      { className: "effect-head class-card-head" },
      ...renderFields([{ ...name, placeholder: () => "name" }], spec, hooks),
      open,
      removeButton(spec.name || "this specialization", () => {
        removeSpecialization(made, spec);
        hooks.reshaped();
      }),
    ),
    ...renderFields([{ ...description, placeholder: () => "what it says when you choose" }], spec, hooks),
    ...renderFields(rest, spec, hooks),
  );
  card.dataset.spec = spec.id;
  return card;
}

function drawMastery(made, hooks, fields) {
  const group = fields.find((field) => field.key === "mastery");
  if (!made.mastery) {
    return addButton("Add a mastery", () => {
      const status = addMastery(made);
      hooks.reshaped();
      hooks.status.edit(status.id);
    });
  }
  return el(
    "div",
    { className: "class-mastery" },
    removeButton("the mastery", () => {
      delete made.mastery;
      hooks.reshaped();
    }),
    ...renderFields(group.fields, made.mastery, hooks),
  );
}

export function classBuilder(made, hooks) {
  settleStartingGear(made);
  const fields = classFields(made);
  const named = (key) => fields.find((field) => field.key === key);
  const strip = (s) => (s ? [drawStrip(s, hooks)] : []);
  const resources = made.resources ?? [];
  const resourceFields = named("resources").fields;
  const specFields = named("specializations").fields;
  return [
    el("div", { className: "ability-head status-head class-head" }, ...renderFields([{ ...named("name"), placeholder: () => "name" }, named("colors")], made, hooks), ...renderFields([{ ...named("description"), placeholder: () => "what it says when you choose it" }], made, hooks)),
    part("Main stat", ...strip(primaryStrip(made))),
    part("Wears", drawArmor(made, hooks)),
    part("Wields", ...strip(weaponStrip(made)), ...strip(startingWeaponStrip(made))),
    part("Off hand", ...strip(offhandStrip(made)), ...strip(startingOffhandStrip(made))),
    part(
      "Resources",
      ...resources.map((resource) => drawResource(made, resource, hooks, resourceFields)),
      ...(resources.length < MOST_RESOURCES
        ? [
            el(
              "div",
              { className: "choice-strip" },
              ...RESOURCE_KINDS.map((kind) => {
                const button = addButton(`Add ${kind}`, () => {
                  addResource(made, kind);
                  hooks.reshaped();
                });
                button.dataset.add = kind;
                return button;
              }),
            ),
          ]
        : []),
    ),
    part(
      "Specializations",
      ...(made.specializations ?? []).map((spec) => drawSpecialization(made, spec, hooks, specFields)),
      addButton("Add a specialization", () => {
        addSpecialization(made);
        hooks.reshaped();
      }),
    ),
    part("Mastery", drawMastery(made, hooks, fields)),
    ...renderSections(CLASS_SECTIONS, fields, made, hooks),
  ];
}

const nameOf = (list, id) => list?.find((x) => x.id === id)?.name || id;

function drawGrant(made, talent, grant, level, hooks) {
  const remove = removeButton("this", () => {
    removeGrant(talent, grant);
    hooks.reshaped();
  });
  const head = (title, ...buttons) => el("div", { className: "effect-head" }, el("span", { className: "effect-title", textContent: title }), ...buttons, remove);
  const specs = grantSpecStrip(made, grant);
  const spec = specs ? [drawStrip(specs, hooks)] : [];
  const shown = [];
  if (grant.ability) {
    const open = el("button", { type: "button", textContent: "edit" });
    open.addEventListener("click", () => hooks.openAbility(grant.ability));
    shown.push(head(`Ability: ${nameOf(made.abilities, grant.ability)}`, open));
  }
  if (grant.status) {
    const open = el("button", { type: "button", textContent: "edit" });
    open.addEventListener("click", () => hooks.status.edit(grant.status));
    const status = made.statuses?.find((s) => s.id === grant.status);
    shown.push(head(`Effect: ${nameOf(made.statuses, grant.status)}`, open), ...(status ? [el("ul", { className: "grant-summary" }, ...statusSummary(status).map((line) => el("li", { textContent: line })))] : []));
  }
  if (shown.length) return el("div", { className: "effect-card" }, ...shown, ...spec);

  // Nothing picked yet: something new, or something the class has.
  const pickFrom = (label, list, key) => {
    const select = el("select", {}, el("option", { value: "", textContent: label }), ...(list ?? []).map((x) => el("option", { value: x.id, textContent: x.name || x.id })));
    select.setAttribute("aria-label", label);
    select.addEventListener("change", () => {
      grant[key] = select.value;
      hooks.reshaped();
    });
    return select;
  };
  const newAbility = addButton("A new ability", () => {
    const ability = grantNewAbility(made, talent, grant, level);
    hooks.changed();
    hooks.openAbility(ability.id);
  });
  newAbility.dataset.add = "ability";
  const newEffect = addButton("A lasting effect", () => {
    hooks.status.create((id) => {
      grantNewStatus(made, talent, grant, id);
      hooks.reshaped();
    });
  });
  newEffect.dataset.add = "status";
  return el("div", { className: "effect-card", title: "what this talent gives" }, el("div", { className: "effect-head" }, el("span", { className: "effect-title", textContent: "It gives" }), remove), el("div", { className: "choice-strip" }, newEffect, newAbility, pickFrom("an ability it has", made.abilities, "ability"), pickFrom("an effect it has", made.statuses, "status")), ...spec);
}

export function talentBuilder(made, talent, level, hooks) {
  const fields = talentFields(made, Number(level));
  const named = (key) => fields.find((field) => field.key === key);
  const requires = requiresStrip(made, talent, level);
  const grants = talent.grants ?? [];
  return [
    el("div", { className: "ability-head status-head" }, ...renderFields([{ ...named("name"), placeholder: () => "name" }], talent, hooks), ...renderFields([{ ...named("description"), placeholder: () => "what it says when you choose it" }], talent, hooks)),
    ...(requires ? [drawStrip(requires, hooks)] : []),
    ...grants.map((grant) => drawGrant(made, talent, grant, level, hooks)),
    addButton(grants.length ? "It also gives" : "It gives", () => {
      talent.grants = [...grants, {}];
      hooks.reshaped();
    }),
    ...renderFields(foldOutFields([named("id")], { quiet: ["id"] }), talent, hooks),
  ];
}
