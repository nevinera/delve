import { BIOMES, BIOME_TAGS } from "../world/biomes.js";
import { BIOME_COLORS } from "../world/tileImage.js";

const DEFAULTS = { height: 20, biome: "forest", tags: [] };

// The height slider is logarithmic either side of 0, so it steps by a foot near sea level and by
// hundreds near the top: position s gives sign(s) * KNEE * (e^(|s| * RATE) - 1) feet, 4 miles at
// the top end and -50ft at the bottom.
export const HEIGHT_SLIDER = { min: -180, max: 1000 };
const TOP_FT = 21120;
const KNEE = 20;
const RATE = Math.log(TOP_FT / KNEE + 1) / HEIGHT_SLIDER.max;

export function sliderHeight(s) {
  if (s >= HEIGHT_SLIDER.max) return TOP_FT;
  const ft = Math.sign(s) * KNEE * Math.expm1(Math.abs(s) * RATE);
  const step = Math.abs(ft) < 100 ? 1 : Math.abs(ft) < 1000 ? 5 : Math.abs(ft) < 10000 ? 50 : 100;
  return Math.round(ft / step) * step || 0;
}

export function heightSlider(ft) {
  return Math.round((Math.sign(ft) * Math.log1p(Math.abs(ft) / KNEE)) / RATE);
}

// The heights and biomes steps' palettes: a height slider, and a biome with tags. A new pin takes its settings
// from here. With a pin selected, the palette shows that pin, and changing it changes the pin.
export class ShapePalette {
  // el: { heightPalette, heightSlider, heightValue, biomePalette, biomeChoices, biomeTags }
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
    el.heightSlider.addEventListener("input", () => this.set({ height: sliderHeight(Number(el.heightSlider.value)) }));
  }

  // Settings for a new pin of this kind.
  pinProps(kind) {
    if (kind === "height") return { height: this.values.height };
    if (kind === "biome") return { biome: this.values.biome, ...(this.values.tags.length ? { tags: [...this.values.tags] } : {}) };
    return {};
  }

  // Changes the palette, and the selected pin when it's a pin these settings belong to.
  set(change) {
    Object.assign(this.values, change);
    const zone = this.editor.focusZone;
    const pin = zone && this.selectedPin(zone);
    if (pin?.kind === "height" && "height" in change) pin.height = change.height;
    if (pin?.kind === "biome" && ("biome" in change || "tags" in change)) {
      pin.biome = this.values.biome;
      if (this.values.tags.length) pin.tags = [...this.values.tags];
      else delete pin.tags;
    }
    this.render();
    if (pin && ["height", "biome"].includes(pin.kind)) this.editor.save(zone);
  }

  selectedPin(zone) {
    const selected = this.editor.features.selected;
    return selected?.type === "pin" && selected.zone === zone.key ? zone.pins.find((p) => p.id === selected.id) : null;
  }

  // Shows the current step's palette, reflecting the selected pin when there is one.
  render() {
    const zone = this.editor.focusZone;
    const pin = zone && this.selectedPin(zone);
    if (pin?.kind === "height") this.values.height = pin.height ?? DEFAULTS.height;
    if (pin?.kind === "biome") Object.assign(this.values, { biome: pin.biome, tags: [...(pin.tags ?? [])] });

    this.el.heightPalette.hidden = this.editor.step !== "heights";
    this.el.biomePalette.hidden = this.editor.step !== "biomes";

    this.el.heightSlider.value = heightSlider(this.values.height);
    this.el.heightValue.textContent = `${this.values.height.toLocaleString()} ft`;
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
