import { iconNode } from "../play/icons.js";

// Forms from lists of fields, for editing a plain object in place. A field is { key, label, type },
// with `hint`, `show(value)` to show it only sometimes, `advanced`, the heading it goes under in the
// fold-out that keeps rarer fields out of the way, `quiet` if it doesn't count as set there, and by type:
// - text, area, color, check: as they sound. Text and area can have `placeholder(value)`.
// - number: `min` and `step`.
// - select: `options`, an array of names or [value, label]s, `more`, rarer options set apart, `none`,
//   the label for leaving it out, `read` and `write` for values the form holds differently, and
//   `then(value)` for what picking one does to other fields.
// - icon: `options`, the names of icons, picked from a grid of them.
// - multi: `options`, kept as a list of those picked. A long list adds from a dropdown.
// - words: a list of words, written with commas.
// - number or word: `word`, a value the check stands for, `after`, the words before the check.
// - group: `fields`, or a function for them if they'd otherwise go on forever, kept as an object under
//   its key, `collapsed` to fold it until it's opened, and `read` and `write` as for a list's items.
// - pairs: an object edited a row at a time, with `keyField` and `valueField` for each row's.
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
export function fold({ owner, name, summary, className, startOpen, draw }) {
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

// A field's node, marked with its key.
function draw(field, value, hooks) {
  const node = RENDERERS[field.type ?? "text"](field, value, hooks);
  node.dataset.key = field.key;
  return node;
}

// How many of these fields hold something.
export const countSet = (fields, value) => fields.filter((field) => !isBlank(value[field.key])).length;

// The advanced fields, under their headings.
function drawAdvanced(fields, value, hooks) {
  const headings = [...new Set(fields.map((field) => field.advanced))];
  return headings.flatMap((heading) => [
    ...(typeof heading === "string" ? [el("div", { className: "form-heading", textContent: heading })] : []),
    ...fields.filter((field) => field.advanced === heading).map((field) => draw(field, value, hooks)),
  ]);
}

function advancedFold(fields, value, hooks, { owner = value, name = "advanced", label = "advanced" } = {}) {
  const set = countSet(fields.filter((field) => !field.quiet), value);
  return fold({
    owner,
    name,
    className: "form-advanced",
    summary: `${label}${set ? ` (${set} set)` : ""}`,
    startOpen: set > 0,
    draw: () => drawAdvanced(fields, value, hooks),
  });
}

// The most a multi lists as checkboxes.
const MULTI_LIMIT = 14;

const RENDERERS = {
  text: (field, value, { changed }) => {
    const input = el("input", { value: value[field.key] ?? "", placeholder: field.placeholder?.(value) ?? "" });
    input.addEventListener("input", () => (setKey(value, field.key, input.value), changed()));
    return row(field, input);
  },
  area: (field, value, { changed }) => {
    const input = el("textarea", { value: value[field.key] ?? "", rows: 2, placeholder: field.placeholder?.(value) ?? "" });
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
    if (field.max !== undefined) input.max = field.max;
    const hint = field.placeholder?.(value);
    if (hint !== undefined) input.placeholder = hint;
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
  icon: (field, value, { reshaped }) => {
    const shown = iconNode(value[field.key], "form-icon-face");
    const button = el("button", { type: "button", className: "form-icon-button" }, shown ?? el("span", { className: "form-icon-face form-icon-none" }), el("span", { textContent: value[field.key] ?? "pick an icon" }));
    const panel = el("div", { className: "form-icon-panel", hidden: true });
    const pick = (name) => {
      setKey(value, field.key, name);
      reshaped();
    };
    const fill = () => {
      const search = el("input", { type: "search", placeholder: "find an icon" });
      search.setAttribute("aria-label", "find an icon");
      const grid = el("div", { className: "form-icon-grid" });
      const show = () => {
        const wanted = search.value.trim().toLowerCase();
        grid.replaceChildren(
          ...optionsOf(field)
            .filter(([name]) => name.includes(wanted))
            .map(([name]) => {
              const tile = el("button", { type: "button", title: name, className: "form-icon-tile" }, iconNode(name, "form-icon-face"));
              tile.setAttribute("aria-label", name);
              tile.classList.toggle("active", name === value[field.key]);
              tile.addEventListener("click", () => pick(name));
              return tile;
            }),
        );
      };
      search.addEventListener("input", show);
      show();
      const clear = el("button", { type: "button", textContent: "no icon" });
      clear.addEventListener("click", () => pick(undefined));
      panel.append(el("div", { className: "form-icon-find" }, search, clear), grid);
    };
    button.addEventListener("click", () => {
      if (!panel.childElementCount) fill();
      panel.hidden = !panel.hidden;
    });
    return el("div", { className: "form-icon" }, el("div", { className: "form-row" }, el("span", { className: "form-label", textContent: field.label ?? field.key }), button), panel);
  },
  select: (field, value, { reshaped, status }) => {
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
    select.addEventListener("change", () => {
      setKey(value, field.key, select.value === "" ? undefined : write(select.value));
      field.then?.(value);
      reshaped();
    });
    // One that picks a status can make one, or open the one it's on, without leaving this form.
    if (status && field.options?.picksStatus) {
      const buttons = [];
      if (shown) {
        const open = el("button", { type: "button", textContent: "edit", className: "form-status-button" });
        open.addEventListener("click", (event) => (event.preventDefault(), status.edit(shown)));
        buttons.push(open);
      }
      const make = el("button", { type: "button", textContent: "new", className: "form-status-button" });
      make.addEventListener("click", (event) => {
        event.preventDefault();
        status.create((id) => {
          setKey(value, field.key, id);
          field.then?.(value);
          reshaped();
        });
      });
      buttons.push(make);
      return row(field, select, ...buttons);
    }
    return row(field, select);
  },
  multi: (field, value, hooks) => {
    const { changed, reshaped } = hooks;
    const options = optionsOf(field);
    const picked = new Set(value[field.key] ?? []);
    const keep = () => setKey(value, field.key, options.map(([o]) => o).filter((o) => picked.has(o)));
    const label = el("span", { className: "form-label", textContent: field.label ?? field.key });
    // A long list would take over the form, so it's what's picked, and a list to add from.
    if (options.length > MULTI_LIMIT) {
      const chips = options
        .filter(([v]) => picked.has(v))
        .map(([v, name]) => {
          const chip = el("button", { type: "button", className: "form-picked", textContent: `${name} ×`, title: `take off ${name}` });
          chip.addEventListener("click", () => (picked.delete(v), keep(), reshaped()));
          return chip;
        });
      const adder = el("select", {}, el("option", { value: "", textContent: "add one" }), ...options.filter(([v]) => !picked.has(v)).map(([v, name]) => el("option", { value: v, textContent: name })));
      adder.setAttribute("aria-label", `add to ${field.label ?? field.key}`);
      adder.addEventListener("change", () => (picked.add(adder.value), keep(), reshaped()));
      return el("div", { className: "form-row", title: field.hint ?? "" }, label, el("div", { className: "form-picks" }, ...chips, adder));
    }
    const boxes = options.map(([v, name]) => {
      const box = el("input", { type: "checkbox", checked: picked.has(v) });
      box.addEventListener("change", () => {
        if (box.checked) picked.add(v);
        else picked.delete(v);
        keep();
        changed();
      });
      return el("label", { className: "form-pick" }, box, name);
    });
    return el("div", { className: "form-row", title: field.hint ?? "" }, label, el("div", { className: "form-picks" }, ...boxes));
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
    if (field.min !== undefined) number.min = field.min;
    const hint = field.placeholder?.(value);
    if (hint !== undefined && !word.checked) number.placeholder = hint;
    number.addEventListener("input", () => (setKey(value, field.key, numberOf(number.value)), changed()));
    word.addEventListener("change", () => (setKey(value, field.key, word.checked ? field.word : undefined), reshaped()));
    return row(field, number, el("span", { textContent: field.after }), word);
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
    return el("div", {}, main, advancedFold(field.more(), parts, { ...hooks, changed, reshaped }, { owner: value, name: `amount ${field.key}`, label: "advanced amount" }));
  },
  group: (field, value, hooks) => {
    const inner = (field.read ?? ((held) => held ?? {}))(value[field.key]);
    const keep = () => setKey(value, field.key, field.write ? field.write(inner) : inner);
    const draw = () =>
      renderFields(typeof field.fields === "function" ? field.fields() : field.fields, inner, {
        ...hooks,
        changed: () => (keep(), hooks.changed()),
        reshaped: () => (keep(), hooks.reshaped()),
      });
    const label = field.label ?? field.key;
    if (field.collapsed) return fold({ owner: value, name: `group ${field.key}`, className: "form-collapsed", summary: label, startOpen: !isBlank(value[field.key]), draw });
    return el("fieldset", { className: "form-group" }, el("legend", { textContent: label }), ...draw());
  },
  pairs: (field, value, hooks) => {
    const { keyField, valueField } = field;
    return RENDERERS.list(
      {
        ...field,
        fields: [keyField, valueField],
        read: undefined,
        write: undefined,
        // A row needs a key to be kept, so a new one takes the first that's free.
        blank: (items) => {
          const taken = items.map((item) => item[keyField.key]);
          const free = optionsOf(keyField).find(([option]) => !taken.includes(option));
          return free ? { [keyField.key]: free[0], [valueField.key]: 1 } : null;
        },
        readAll: (held) => Object.entries(held ?? {}).map(([k, v]) => ({ [keyField.key]: k, [valueField.key]: v })),
        writeAll: (items) => Object.fromEntries(items.filter((item) => item[keyField.key]).map((item) => [item[keyField.key], item[valueField.key] ?? 1])),
      },
      value,
      hooks,
    );
  },
  list: (field, value, hooks) => {
    const read = field.read ?? ((item) => item);
    const write = field.write ?? ((item) => item);
    const items = field.readAll ? field.readAll(value[field.key]) : (value[field.key] ?? []).map(read);
    const keep = () => setKey(value, field.key, field.writeAll ? field.writeAll(items) : items.map(write));
    const changed = () => (keep(), hooks.changed());
    const reshaped = () => (keep(), hooks.reshaped());
    const add = el("button", { type: "button", textContent: `add ${field.one ?? "one"}`, disabled: field.limit !== undefined && items.length >= field.limit });
    add.addEventListener("click", () => {
      const item = field.blank(items);
      if (!item) return;
      items.push(item);
      reshaped();
    });
    const nodes = items.map((item, n) => {
      const remove = el("button", { type: "button", textContent: "remove", className: "form-remove" });
      remove.addEventListener("click", () => {
        items.splice(n, 1);
        reshaped();
      });
      return el("div", { className: "form-item" }, remove, ...renderFields(field.fields, item, { ...hooks, changed, reshaped }));
    });
    return el("fieldset", { className: "form-group" }, el("legend", { textContent: field.label ?? field.key }), ...nodes, add);
  },
};

// Which fields show can hang on one that has to have a value, so those get theirs first.
function fillRequired(fields, value) {
  for (const field of fields) {
    if (field.type !== "select" || field.none !== undefined || field.advanced || value[field.key] !== undefined) continue;
    if (field.show && !field.show(value)) continue;
    const [first] = optionsOf(field);
    if (first) value[field.key] = (field.write ?? ((v) => v))(first[0]);
  }
}

// `fields` under folding headings, in the order of `sections`: { name, keys }. A field not in a section isn't drawn.
export function renderSections(sections, fields, value, hooks) {
  return sections.map((section) => {
    const shown = fields.filter((field) => section.keys.includes(field.key) && (!field.show || field.show(value)));
    const set = countSet(shown, value);
    return fold({
      owner: value,
      name: `section ${section.name}`,
      className: "form-section",
      summary: `${section.name}${set ? ` (${set} set)` : ""}`,
      startOpen: false,
      draw: () => shown.map((field) => draw(field, value, hooks)),
    });
  });
}

// The nodes for `fields`, editing `value` in place. changed() hears any change, and reshaped() one
// that changes which fields there are, so they have to be drawn again. `status`, if there is one, has
// edit(id) and create(done) for fields whose options are a class's statuses.
export function renderFields(fields, value, hooks) {
  fillRequired(fields, value);
  const shown = fields.filter((field) => !field.show || field.show(value));
  const advanced = shown.filter((field) => field.advanced);
  return [...shown.filter((field) => !field.advanced).map((field) => draw(field, value, hooks)), ...(advanced.length ? [advancedFold(advanced, value, hooks)] : [])];
}
