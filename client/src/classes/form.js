// Forms from lists of fields, for editing a plain object in place. A field is { key, label, type },
// with `hint`, `show(value)` to show it only sometimes, `advanced`, the heading it goes under in the
// fold-out that keeps rarer fields out of the way, and by type:
// - text, area, color, check: as they sound.
// - number: `min` and `step`.
// - select: `options`, an array of names or [value, label]s, `more`, rarer options set apart, `none`,
//   the label for leaving it out, and `read` and `write` for values the form holds differently.
// - multi: `options`, kept as a list of those picked.
// - words: a list of words, written with commas.
// - number or word: `word`, a value the check stands for, `after`, the words before the check.
// - json: for an object with no fields of its own.
// - group: `fields`, kept as an object under its key, and `collapsed` to fold it until it's opened.
// - list: `fields` for each item, `blank()` for a new one, `one`, what to call one, `limit`, and
//   `read` and `write`, for items the form holds differently from the file.
// - amount, distance: as the game data's are (formats.md). An amount's `more()` is fields for its rarer parts.
// Leaving a field empty takes its key away, so the file holds only what's been set.

// Whether a value is the same as leaving it out.
export const isBlank = (value) =>
  value === undefined || value === null || value === "" || Number.isNaN(value) || (Array.isArray(value) && !value.length) || (typeof value === "object" && !Array.isArray(value) && !Object.keys(value).length);

export function setKey(object, key, value) {
  if (isBlank(value)) delete object[key];
  else object[key] = value;
}

const AMOUNT_PARTS = ["attackPower", "spellPower", "weapon", "mastery", "byMastery", "maxHealth", "shareOfTrigger", "shareOf", "minimum", "maximum", "byMissingHealth", "perSpent"];

// An amount as the form shows it: its parts, with min and max in place of base.
export function readAmount(amount) {
  if (amount === undefined || amount === null) return {};
  if (typeof amount === "number") return { min: amount, max: amount };
  if (Array.isArray(amount)) return { min: amount[0], max: amount[1] };
  const base = amount.base === undefined ? {} : readAmount(amount.base);
  const out = { ...base };
  for (const part of AMOUNT_PARTS) if (amount[part] !== undefined) out[part] = amount[part];
  return out;
}

// That back as the shortest amount that says it: a number, [min, max], or parts.
export function writeAmount({ min, max, ...parts }) {
  const low = min ?? max;
  const high = max ?? min;
  const base = low === undefined ? undefined : low === high ? low : [low, high];
  const others = Object.fromEntries(AMOUNT_PARTS.filter((part) => !isBlank(parts[part])).map((part) => [part, parts[part]]));
  if (!Object.keys(others).length) return base;
  return base === undefined ? others : { base, ...others };
}

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

const numberOf = (text) => (text.trim() === "" ? undefined : Number(text));

const row = (field, ...inputs) =>
  el("label", { className: "form-row", title: field.hint ?? "" }, el("span", { className: "form-label", textContent: field.label ?? field.key }), ...inputs);

const listOf = (options = []) => (typeof options === "function" ? options() : options).map((o) => (Array.isArray(o) ? o : [o, o]));
const optionsOf = (field) => listOf(field.options);

// Which fold-outs someone has opened or closed, by what they edit, so drawing the form again keeps them.
const folds = new WeakMap();
const foldOf = (owner, name) => folds.get(owner)?.get(name);
const setFold = (owner, name, open) => {
  if (!folds.has(owner)) folds.set(owner, new Map());
  folds.get(owner).set(name, open);
};

// A fold-out that draws what's in it the first time it opens. It starts open if something in it is set.
function fold({ owner, name, summary, className, startOpen, draw }) {
  const open = foldOf(owner, name) ?? startOpen;
  const box = el("div", { className: "form-fold-body" });
  let drawn = false;
  const fill = () => {
    if (drawn) return;
    drawn = true;
    box.append(...draw());
  };
  const node = el("details", { className, open }, el("summary", { textContent: summary }), box);
  if (open) fill();
  node.addEventListener("toggle", () => {
    setFold(owner, name, node.open);
    if (node.open) fill();
  });
  return node;
}

// How many of these fields hold something.
export const countSet = (fields, value) => fields.filter((field) => !isBlank(value[field.key])).length;

// The advanced fields, under their headings.
function drawAdvanced(fields, value, hooks) {
  const headings = [...new Set(fields.map((field) => field.advanced))];
  return headings.flatMap((heading) => [
    ...(typeof heading === "string" ? [el("div", { className: "form-heading", textContent: heading })] : []),
    ...fields.filter((field) => field.advanced === heading).map((field) => RENDERERS[field.type ?? "text"](field, value, hooks)),
  ]);
}

function advancedFold(fields, value, hooks, { owner = value, name = "advanced", label = "advanced" } = {}) {
  const set = countSet(fields, value);
  return fold({
    owner,
    name,
    className: "form-advanced",
    summary: `${label}${set ? ` (${set} set)` : ""}`,
    startOpen: set > 0,
    draw: () => drawAdvanced(fields, value, hooks),
  });
}

const RENDERERS = {
  text: (field, value, { changed }) => {
    const input = el("input", { value: value[field.key] ?? "" });
    input.addEventListener("input", () => (setKey(value, field.key, input.value), changed()));
    return row(field, input);
  },
  area: (field, value, { changed }) => {
    const input = el("textarea", { value: value[field.key] ?? "", rows: 2 });
    input.addEventListener("input", () => (setKey(value, field.key, input.value), changed()));
    return row(field, input);
  },
  color: (field, value, { changed, reshaped }) => {
    const input = el("input", { type: "color", value: value[field.key] ?? "#808080" });
    input.addEventListener("input", () => (value[field.key] = input.value, changed()));
    const clear = el("button", { type: "button", textContent: "×", title: "leave it out", hidden: value[field.key] === undefined });
    clear.addEventListener("click", (e) => (e.preventDefault(), delete value[field.key], reshaped()));
    return row(field, input, clear);
  },
  number: (field, value, { changed }) => {
    const input = el("input", { type: "number", value: value[field.key] ?? "", step: field.step ?? "any" });
    if (field.min !== undefined) input.min = field.min;
    input.addEventListener("input", () => (setKey(value, field.key, numberOf(input.value)), changed()));
    return row(field, input);
  },
  check: (field, value, { reshaped }) => {
    const input = el("input", { type: "checkbox", checked: value[field.key] ?? field.default ?? false });
    input.addEventListener("change", () => {
      // What's the same as the default stays out of the file.
      setKey(value, field.key, input.checked === (field.default ?? false) ? undefined : input.checked);
      reshaped();
    });
    return row(field, input);
  },
  select: (field, value, { reshaped }) => {
    const options = optionsOf(field);
    const more = listOf(field.more);
    const read = field.read ?? ((v) => v);
    const write = field.write ?? ((v) => v);
    // One that has to have a value starts on the first.
    if (field.none === undefined && value[field.key] === undefined && options.length) value[field.key] = write(options[0][0]);
    const shown = read(value[field.key]);
    const select = el("select");
    const option = ([v, label]) => el("option", { value: v, textContent: label });
    if (field.none !== undefined) select.append(el("option", { value: "", textContent: field.none }));
    select.append(...options.map(option));
    if (more.length) select.append(el("optgroup", { label: "more" }, ...more.map(option)));
    // A value that isn't among them any more still shows, to fix.
    if (shown !== undefined && ![...options, ...more].some(([v]) => v === shown)) select.append(option([shown, `${shown} (missing)`]));
    select.value = shown ?? "";
    select.addEventListener("change", () => (setKey(value, field.key, select.value === "" ? undefined : write(select.value)), reshaped()));
    return row(field, select);
  },
  multi: (field, value, { changed }) => {
    const picked = new Set(value[field.key] ?? []);
    const boxes = optionsOf(field).map(([v, label]) => {
      const box = el("input", { type: "checkbox", checked: picked.has(v) });
      box.addEventListener("change", () => {
        if (box.checked) picked.add(v);
        else picked.delete(v);
        setKey(value, field.key, optionsOf(field).map(([o]) => o).filter((o) => picked.has(o)));
        changed();
      });
      return el("label", { className: "form-pick" }, box, label);
    });
    return el("div", { className: "form-row", title: field.hint ?? "" }, el("span", { className: "form-label", textContent: field.label ?? field.key }), el("div", { className: "form-picks" }, ...boxes));
  },
  words: (field, value, { changed }) => {
    const input = el("input", { value: (value[field.key] ?? []).join(", ") });
    input.addEventListener("input", () => {
      setKey(value, field.key, input.value.split(",").map((w) => w.trim()).filter(Boolean));
      changed();
    });
    return row(field, input);
  },
  distance: (field, value, hooks) => RENDERERS.numberOr({ ...field, word: "melee", after: "ft or melee" }, value, hooks),
  numberOr: (field, value, { reshaped, changed }) => {
    const word = el("input", { type: "checkbox", checked: value[field.key] === field.word });
    const number = el("input", { type: "number", step: "any", disabled: word.checked, value: word.checked ? "" : (value[field.key] ?? "") });
    number.addEventListener("input", () => (setKey(value, field.key, numberOf(number.value)), changed()));
    word.addEventListener("change", () => (setKey(value, field.key, word.checked ? field.word : undefined), reshaped()));
    return row(field, number, el("span", { textContent: field.after }), word);
  },
  json: (field, value, { changed }) => {
    const input = el("textarea", { rows: 3, value: value[field.key] === undefined ? "" : JSON.stringify(value[field.key]) });
    input.addEventListener("input", () => {
      const text = input.value.trim();
      try {
        setKey(value, field.key, text === "" ? undefined : JSON.parse(text));
        input.classList.remove("form-wrong");
        changed();
      } catch {
        input.classList.add("form-wrong");
      }
    });
    return row(field, input);
  },
  amount: (field, value, hooks) => {
    const parts = readAmount(value[field.key]);
    const keep = () => setKey(value, field.key, writeAmount(parts));
    const changed = () => (keep(), hooks.changed());
    const input = (part, label) => {
      const box = el("input", { type: "number", step: "any", value: parts[part] ?? "", title: label, placeholder: label });
      box.addEventListener("input", () => {
        const number = numberOf(box.value);
        if (number === undefined) delete parts[part];
        else parts[part] = number;
        changed();
      });
      return box;
    };
    const main = el(
      "div",
      { className: "form-row", title: field.hint ?? "" },
      el("span", { className: "form-label", textContent: field.label ?? field.key }),
      el("div", { className: "form-amount" }, input("min", "min"), input("max", "max"), input("attackPower", "× attack power"), input("spellPower", "× spell power")),
    );
    if (!field.more) return main;
    const reshaped = () => (keep(), hooks.reshaped());
    return el("div", {}, main, advancedFold(field.more(), parts, { changed, reshaped }, { owner: value, name: `amount ${field.key}`, label: "advanced amount" }));
  },
  group: (field, value, hooks) => {
    const inner = value[field.key] ?? {};
    const keep = () => setKey(value, field.key, inner);
    const draw = () =>
      renderFields(field.fields, inner, {
        changed: () => (keep(), hooks.changed()),
        reshaped: () => (keep(), hooks.reshaped()),
      });
    const label = field.label ?? field.key;
    if (field.collapsed) return fold({ owner: value, name: `group ${field.key}`, className: "form-collapsed", summary: label, startOpen: !isBlank(value[field.key]), draw });
    return el("fieldset", { className: "form-group" }, el("legend", { textContent: label }), ...draw());
  },
  list: (field, value, hooks) => {
    const read = field.read ?? ((item) => item);
    const write = field.write ?? ((item) => item);
    const items = (value[field.key] ?? []).map(read);
    const keep = () => setKey(value, field.key, items.map(write));
    const changed = () => (keep(), hooks.changed());
    const reshaped = () => (keep(), hooks.reshaped());
    const add = el("button", { type: "button", textContent: `add ${field.one ?? "one"}`, disabled: field.limit !== undefined && items.length >= field.limit });
    add.addEventListener("click", () => {
      items.push(field.blank());
      reshaped();
    });
    const nodes = items.map((item, n) => {
      const remove = el("button", { type: "button", textContent: "remove", className: "form-remove" });
      remove.addEventListener("click", () => {
        items.splice(n, 1);
        reshaped();
      });
      return el("div", { className: "form-item" }, remove, ...renderFields(field.fields, item, { changed, reshaped }));
    });
    return el("fieldset", { className: "form-group" }, el("legend", { textContent: field.label ?? field.key }), ...nodes, add);
  },
};

// The nodes for `fields`, editing `value` in place. changed() hears any change, and reshaped() one
// that changes which fields there are, so they have to be drawn again.
export function renderFields(fields, value, hooks) {
  // Which fields show can hang on one that has to have a value, so those get theirs first.
  for (const field of fields) {
    if (field.type !== "select" || field.none !== undefined || field.advanced || value[field.key] !== undefined) continue;
    if (field.show && !field.show(value)) continue;
    const [first] = optionsOf(field);
    if (first) value[field.key] = (field.write ?? ((v) => v))(first[0]);
  }
  const shown = fields.filter((field) => !field.show || field.show(value));
  const advanced = shown.filter((field) => field.advanced);
  return [...shown.filter((field) => !field.advanced).map((field) => RENDERERS[field.type ?? "text"](field, value, hooks)), ...(advanced.length ? [advancedFold(advanced, value, hooks)] : [])];
}
