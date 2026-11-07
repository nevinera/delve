import { PIN_NAME_MAX, PIN_TYPES } from "../v2/mapPins.js";

// The map tool's form for a map pin (v2/mapPins.js), over the map where it was clicked: its id,
// name and type, to put a new one in, or change or take away the one clicked. The id follows the
// name until it's typed in itself.

const slug = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);

export class MapPinForm {
  // store: the continent's MapPins.
  constructor(store, parent = document.body) {
    this.store = store;
    this.box = document.createElement("form");
    this.box.className = "create-map-pin";
    // Shown and hidden by its display, since a style's display would show it through `hidden`.
    this.box.style.cssText = "position: fixed; z-index: 1001; display: none; gap: 6px; padding: 10px 12px; width: 240px; background: rgba(20, 18, 24, 0.94); color: #eee; border: 1px solid #555; border-radius: 6px; font: 13px sans-serif";
    this.box.innerHTML = `
      <label>name <input name="name" maxlength="${PIN_NAME_MAX}" autocomplete="off" style="width: 100%"></label>
      <label>id <input name="id" maxlength="32" autocomplete="off" spellcheck="false" style="width: 100%"></label>
      <label>type <select name="type">${PIN_TYPES.map((t) => `<option value="${t}">${t}</option>`).join("")}</select></label>
      <p data-trouble style="margin: 0; color: #f2a08c" hidden></p>
      <div style="display: flex; gap: 6px; justify-content: flex-end">
        <button type="button" data-remove>delete</button>
        <button type="button" data-cancel>cancel</button>
        <button type="submit">save</button>
      </div>`;
    parent.append(this.box);
    const field = (name) => this.box.elements.namedItem(name);
    [this.name, this.id, this.type] = ["name", "id", "type"].map(field);
    this.trouble = this.box.querySelector("[data-trouble]");
    this.removeButton = this.box.querySelector("[data-remove]");
    this.name.addEventListener("input", () => this.idFollows && (this.id.value = slug(this.name.value)));
    this.id.addEventListener("input", () => (this.idFollows = false));
    this.box.addEventListener("submit", (e) => {
      e.preventDefault();
      this.save();
    });
    this.box.querySelector("[data-cancel]").addEventListener("click", () => this.close());
    this.removeButton.addEventListener("click", () => {
      this.store.remove(this.pin);
      this.close();
    });
    // Keys typed here stay here, and Escape puts it away without closing the map.
    this.box.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") this.close();
    });
  }

  // For `pin`, or a new one at [x, z], over screen point [left, top].
  open(pin, [x, z], [left, top]) {
    this.pin = pin;
    this.at = pin ? pin.at : [x, z];
    this.name.value = pin?.name ?? "";
    this.id.value = pin?.id ?? "";
    this.type.value = pin?.type ?? PIN_TYPES[0];
    this.idFollows = !pin;
    this.removeButton.hidden = !pin;
    this.trouble.hidden = true;
    this.box.style.display = "grid";
    this.box.style.left = `${Math.min(left + 12, innerWidth - 260)}px`;
    this.box.style.top = `${Math.min(top + 12, innerHeight - 180)}px`;
    this.name.focus();
  }

  save() {
    const pin = { id: this.id.value.trim(), name: this.name.value.trim(), type: this.type.value, at: this.at };
    const trouble = this.store.set(pin, this.pin);
    this.trouble.textContent = trouble;
    this.trouble.hidden = !trouble;
    if (!trouble) this.close();
  }

  close() {
    this.box.style.display = "none";
    this.pin = null;
  }
}
