import "./swatches.css";
import { SLAB_PRESETS } from "../world/slabs.js";
import { presetPixels } from "../render/slabTextures.js";

// A swatch that's a button: it shows what's picked, and opens a pullout of every choice's swatch
// beside it. A tintable choice, once picked, shows a color picker beside the swatch, its tint. Its
// element has a `value` and a `color` (the tint, or null), and fires "input" and "change" when
// either changes, as a select does.

const SWATCH_PX = 40;

// choices: [{ value, label, draw(canvas, color), tint }], draw left out for a choice with no
// picture, which shows its label, and tint, its default color, for one that's tintable. Its
// element takes `id` and `title`. tintControl(choice), where given, makes what tints `choice`, or
// null, in place of a color picker for its tint.
export function swatchPicker(choices, { value = choices[0]?.value, color = null, id, title, tintControl } = {}) {
  const root = el("span", { className: "swatch-picker" });
  if (id) root.id = id;
  const face = el("button", { type: "button", className: "swatch", title: title ?? "" });
  const tintBox = el("span", { className: "swatch-tint" });
  const pullout = el("div", { className: "swatch-pullout" });
  pullout.popover = "auto";
  root.append(face, tintBox, pullout);

  let picked = value;
  let tint = color;
  const choiceNow = () => choices.find((c) => c.value === picked) ?? choices[0];
  const changed = () => {
    root.dispatchEvent(new Event("input", { bubbles: true }));
    root.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const showFace = () => {
    const choice = choiceNow();
    face.replaceChildren(...swatch(choice, tint ?? choice?.tint));
    face.title = [title, choice?.label].filter(Boolean).join(": ");
  };
  const show = () => {
    const choice = choiceNow();
    showFace();
    for (const button of pullout.children) button.setAttribute("aria-pressed", String(button.dataset.value === picked));
    if (tintControl) return tintBox.replaceChildren(...[choice && tintControl(choice)].filter(Boolean));
    if (!choice?.tint) return tintBox.replaceChildren();
    const input = el("input", { type: "color", value: tint ?? choice.tint, title: `${choice.label}'s color` });
    // The swatch follows the picker; what's picked changes once the picker closes, so there's one
    // new picture to make, not one for each color passed on the way.
    input.addEventListener("input", () => {
      tint = input.value === choice.tint ? null : input.value;
      showFace();
    });
    input.addEventListener("change", changed);
    tintBox.replaceChildren(input);
  };
  const fill = () => {
    pullout.replaceChildren(
      ...choices.map((choice) => {
        const button = el("button", { type: "button", className: "swatch", title: choice.label });
        button.dataset.value = choice.value;
        button.append(...swatch(choice, choice.tint));
        button.addEventListener("click", () => {
          pullout.hidePopover();
          picked = choice.value;
          tint = null;
          show();
          changed();
        });
        return button;
      }),
    );
    show();
  };

  face.addEventListener("click", () => {
    if (!pullout.childElementCount) fill();
    pullout.togglePopover();
  });
  // Beside the button, on the side with room, kept on the screen.
  pullout.addEventListener("toggle", (e) => {
    if (e.newState !== "open") return;
    const at = face.getBoundingClientRect();
    const { width, height } = pullout.getBoundingClientRect();
    const left = at.left - width - 6 >= 0 ? at.left - width - 6 : Math.min(at.right + 6, innerWidth - width - 6);
    pullout.style.left = `${Math.max(6, left)}px`;
    pullout.style.top = `${Math.max(6, Math.min(at.top, innerHeight - height - 6))}px`;
  });

  Object.defineProperty(root, "value", {
    get: () => picked,
    set: (v) => {
      picked = v;
      tint = null;
      show();
    },
  });
  Object.defineProperty(root, "color", {
    get: () => tint,
    set: (v) => {
      tint = v;
      show();
    },
  });
  // New choices, keeping what's picked if it's still among them.
  root.setChoices = (next) => {
    choices = next;
    if (!choices.some((c) => c.value === picked)) picked = choices[0]?.value;
    pullout.replaceChildren();
    show();
  };
  show();
  return root;
}

// A slab surface preset's choice, tinted from its own color.
export function surfaceChoice(name) {
  return { value: name, label: words(name), tint: SLAB_PRESETS[name].color, draw: (canvas, color) => drawPreset(canvas, name, color) };
}

// Every slab surface preset's choice.
export const surfaceChoices = () => Object.keys(SLAB_PRESETS).map(surfaceChoice);

// The slab surface a picker of surfaceChoices has picked: the preset's name, or { color, preset }
// when it's tinted. Other values (mountSwatches' extras) are as they are.
export function pickedSurface(picker) {
  return picker.color && Object.hasOwn(SLAB_PRESETS, picker.value) ? { color: picker.color, preset: picker.value } : picker.value;
}

// Puts a swatch picker in place of each `[data-swatches]` element under `root`, keeping its id and
// title: "surfaces" offers the slab presets, after a choice for each of its `data-extra`,
// "value:label" separated by commas. `data-value` is what's picked first.
export function mountSwatches(root = document) {
  for (const spot of root.querySelectorAll("[data-swatches]")) {
    const extra = (spot.dataset.extra ?? "").split(",").filter(Boolean).map((pair) => {
      const [value, label] = pair.split(":");
      return { value, label: label ?? value };
    });
    const picker = swatchPicker([...extra, ...surfaceChoices()], { value: spot.dataset.value, id: spot.id, title: spot.title });
    spot.replaceWith(picker);
  }
}

const painted = new Map(); // preset name -> its picture in its own color, as a canvas

function drawPreset(canvas, name, color = SLAB_PRESETS[name].color) {
  const own = color === SLAB_PRESETS[name].color;
  let full = own && painted.get(name);
  if (!full) {
    const { size, rgba } = presetPixels(name, color);
    full = el("canvas", { width: size, height: size });
    full.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength), size, size), 0, 0);
    if (own) painted.set(name, full);
  }
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(full, 0, 0, canvas.width, canvas.height);
}

// A choice's picture in `color`, or its label where it has none.
function swatch(choice, color) {
  if (!choice) return [];
  if (!choice.draw) return [el("span", { className: "swatch-word", textContent: choice.label })];
  const canvas = el("canvas", { width: SWATCH_PX, height: SWATCH_PX });
  choice.draw(canvas, color);
  return [canvas];
}

const words = (name) => name.replace(/([a-z])([A-Z])/g, (_, a, b) => `${a} ${b.toLowerCase()}`);

function el(tag, props) {
  return Object.assign(document.createElement(tag), props);
}
