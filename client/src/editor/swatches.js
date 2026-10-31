import "./swatches.css";
import { SLAB_PRESETS } from "../world/slabs.js";
import { presetPixels } from "./slabTextures.js";

// A swatch that's a button: it shows what's picked, and opens a pullout of every choice's swatch
// beside it. Its element has a `value`, and fires "input" and "change" when a choice is picked, as
// a select does.

const SWATCH_PX = 40;

// choices: [{ value, label, draw(canvas) }], draw left out for a choice with no picture, which
// shows its label. Its element takes `id` and `title`.
export function swatchPicker(choices, { value = choices[0]?.value, id, title } = {}) {
  const root = el("span", { className: "swatch-picker" });
  if (id) root.id = id;
  const face = el("button", { type: "button", className: "swatch", title: title ?? "" });
  const pullout = el("div", { className: "swatch-pullout" });
  pullout.popover = "auto";
  root.append(face, pullout);

  let picked = value;
  const show = () => {
    const choice = choices.find((c) => c.value === picked) ?? choices[0];
    face.replaceChildren(...swatch(choice));
    face.title = [title, choice?.label].filter(Boolean).join(": ");
    for (const button of pullout.children) button.setAttribute("aria-pressed", String(button.dataset.value === picked));
  };
  const fill = () => {
    pullout.replaceChildren(
      ...choices.map((choice) => {
        const button = el("button", { type: "button", className: "swatch", title: choice.label });
        button.dataset.value = choice.value;
        button.append(...swatch(choice));
        button.addEventListener("click", () => {
          pullout.hidePopover();
          root.value = choice.value;
          root.dispatchEvent(new Event("input", { bubbles: true }));
          root.dispatchEvent(new Event("change", { bubbles: true }));
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

// A slab surface preset's choice.
export function surfaceChoice(name) {
  return { value: name, label: words(name), draw: (canvas) => drawPreset(canvas, name) };
}

// Every slab surface preset's choice.
export const surfaceChoices = () => Object.keys(SLAB_PRESETS).map(surfaceChoice);

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

const painted = new Map(); // preset name -> its picture as a canvas

function drawPreset(canvas, name) {
  if (!painted.has(name)) {
    const { size, rgba } = presetPixels(name);
    const full = el("canvas", { width: size, height: size });
    full.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength), size, size), 0, 0);
    painted.set(name, full);
  }
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(painted.get(name), 0, 0, canvas.width, canvas.height);
}

// A choice's picture, or its label where it has none.
function swatch(choice) {
  if (!choice) return [];
  if (!choice.draw) return [el("span", { className: "swatch-word", textContent: choice.label })];
  const canvas = el("canvas", { width: SWATCH_PX, height: SWATCH_PX });
  choice.draw(canvas);
  return [canvas];
}

const words = (name) => name.replace(/([a-z])([A-Z])/g, (_, a, b) => `${a} ${b.toLowerCase()}`);

function el(tag, props) {
  return Object.assign(document.createElement(tag), props);
}
