import { BIOMES, BIOME_TAGS } from "../world/biomes.js";
import { BIOME_COLORS } from "../world/tileImage.js";

const DEFAULTS = { biome: "forest", tags: [] };

// The biomes step's palette: a biome with tags. A new pin takes its settings from here. With a pin
// selected, the palette shows that pin, and changing it changes the pin.
export class ShapePalette {
  // el: { biomeChoices, biomeTags }
  constructor(editor, el) {
    this.editor = editor;
    this.el = el;
    this.values = structuredClone(DEFAULTS);

    for (const biome of BIOMES) {
      el.biomeChoices.append(choice("radio", "biome", biome, () => this.set({ biome }), BIOME_COLORS[biome]));
    }
    for (const tag of BIOME_TAGS) {
      el.biomeTags.append(
        choice("checkbox", "tag", tag, (checked) => {
          const tags = this.values.tags.filter((t) => t !== tag);
          this.set({ tags: checked ? [...tags, tag] : tags });
        }),
      );
    }
  }

  // Settings for a new pin of this kind.
  pinProps(kind) {
    if (kind === "biome") return { biome: this.values.biome, ...(this.values.tags.length ? { tags: [...this.values.tags] } : {}) };
    return {};
  }

  // Changes the palette, and the selected pin when it's a pin these settings belong to.
  set(change) {
    Object.assign(this.values, change);
    const pin = this.selectedPin();
    if (pin?.kind === "biome" && ("biome" in change || "tags" in change)) {
      pin.biome = this.values.biome;
      if (this.values.tags.length) pin.tags = [...this.values.tags];
      else delete pin.tags;
    }
    this.render();
    if (pin?.kind === "biome") this.editor.saveSketch();
  }

  selectedPin() {
    const selected = this.editor.features.selected;
    return selected?.type === "pin" ? this.editor.sketch.pins.find((p) => p.id === selected.id) : null;
  }

  // Shows the palette's settings, reflecting the selected pin when there is one.
  render() {
    const pin = this.selectedPin();
    if (pin?.kind === "biome") Object.assign(this.values, { biome: pin.biome, tags: [...(pin.tags ?? [])] });
    for (const input of this.el.biomeChoices.querySelectorAll("input")) input.checked = input.value === this.values.biome;
    for (const input of this.el.biomeTags.querySelectorAll("input")) input.checked = this.values.tags.includes(input.value);
  }
}

function choice(type, name, value, onChange, color) {
  const label = document.createElement("label");
  label.className = "editor-check";
  const input = document.createElement("input");
  input.type = type;
  input.name = name;
  input.value = value;
  input.addEventListener("change", () => onChange(input.checked));
  const text = document.createElement("span");
  text.textContent = value;
  label.append(input);
  if (color) {
    const swatch = document.createElement("span");
    swatch.className = "editor-swatch";
    swatch.style.background = `rgb(${color.join(",")})`;
    label.append(swatch);
  }
  label.append(text);
  return label;
}
