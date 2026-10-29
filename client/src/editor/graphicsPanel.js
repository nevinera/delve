import { CLUTTER_RADIUS_FT, RESOLUTIONS, SCENE_PARTS } from "./renderView.js";

// The graphics settings for a RenderView, built into `root`: a radio button for each resolution, a
// checkbox for each part of the scene, solid canopies, and sliders for ground clutter's radius and
// density. They change the view's settings. Returns show(graphics), which sets them to the view's
// settings, for when those change elsewhere (the stats overlay's keys, say). check and range: the
// class names for a checkbox or radio button's label and a slider's. parts: the parts of the scene
// that can be left out, by their names in SCENE_PARTS, each with what to call it. solid: what to
// call solid canopies.
export function graphicsPanel(root, view, { check = "editor-check", range = "editor-range", parts = Object.fromEntries(SCENE_PARTS.map((p) => [p, p])), solid: solidLabel = "solid canopies" } = {}) {
  const partNames = Object.keys(parts);
  root.innerHTML = `
    <h3>Resolution</h3><div data-resolutions></div>
    <h3>Draw</h3><div data-parts></div>
    <label class="${check}" title="Draws every tree crown as its cheapest, far-away stage"><input data-solid type="checkbox"><span></span></label>
    <h3>Ground clutter</h3>
    <label class="${range}">radius <input data-radius type="range" step="10"><output></output></label>
    <label class="${range}">density <input data-density type="range" min="10" max="100" step="5"><output></output></label>`;
  const $ = (attr) => root.querySelector(`[data-${attr}]`);
  const box = (type, name, text) => {
    const el = document.createElement("label");
    el.className = check;
    el.innerHTML = `<input type="${type}" name="${name}"><span></span>`;
    el.querySelector("span").textContent = text;
    return el;
  };
  for (const r of RESOLUTIONS) $("resolutions").append(box("radio", "graphicsResolution", r === "full" ? "full" : `${r}x`));
  for (const p of partNames) $("parts").append(box("checkbox", "graphicsPart", parts[p]));
  $("solid").nextElementSibling.textContent = solidLabel;
  const inputs = (el) => [...el.querySelectorAll("input")];
  const [solid, radius, density] = [$("solid"), $("radius"), $("density")];

  inputs($("resolutions")).forEach((input, i) => input.addEventListener("change", () => view.setGraphics({ resolution: RESOLUTIONS[i] })));
  inputs($("parts")).forEach((input, i) =>
    input.addEventListener("change", () => {
      const { hidden } = view.graphics;
      if (input.checked) hidden.delete(partNames[i]);
      else hidden.add(partNames[i]);
      view.setGraphics({ hidden });
    }),
  );
  solid.addEventListener("change", () => view.setGraphics({ solidCanopies: solid.checked }));
  Object.assign(radius, CLUTTER_RADIUS_FT);
  radius.addEventListener("input", () => view.setGraphics({ clutterRadiusFt: Number(radius.value) }));
  density.addEventListener("input", () => view.setGraphics({ clutterDensity: Number(density.value) / 100 }));
  // So keys go back to walking and the stats overlay.
  root.addEventListener("change", (e) => e.target.blur());

  const show = ({ resolution, hidden, solidCanopies, clutterRadiusFt, clutterDensity }) => {
    inputs($("resolutions")).forEach((input, i) => (input.checked = RESOLUTIONS[i] === resolution));
    inputs($("parts")).forEach((input, i) => (input.checked = !hidden.has(partNames[i])));
    solid.checked = solidCanopies;
    radius.value = clutterRadiusFt;
    density.value = Math.round(clutterDensity * 100);
    radius.nextElementSibling.textContent = `${radius.value} ft`;
    density.nextElementSibling.textContent = `${density.value}%`;
  };
  show(view.graphics);
  return show;
}
