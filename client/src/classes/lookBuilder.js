import { drawStrip, el } from "./choiceStrip.js";
import { colorStrip, hasNoLook, momentsOf, motionStrip, sizeStrip, soundStrip, suggestLook, visualStrip, weightStrip } from "./lookChoices.js";

// How an ability looks and sounds: how the body moves, and what shows and sounds at each of its moments.
// Each pick plays it in the preview, so you see and hear what you picked.

export function lookBuilder(ability, hooks) {
  const playing = {
    ...hooks,
    reshaped: () => {
      hooks.reshaped();
      hooks.tryIt?.();
    },
  };
  const strip = (s) => (s ? [drawStrip(s, playing)] : []);
  const start = el("button", { type: "button", className: "look-start", textContent: "Start from a look that fits" });
  start.addEventListener("click", () => {
    suggestLook(ability);
    playing.reshaped();
  });
  return [
    ...strip(motionStrip(ability)),
    ...strip(weightStrip(ability)),
    ...(hasNoLook(ability) ? [start] : []),
    ...momentsOf(ability).map(({ when, label }) => {
      const card = el("div", { className: "moment" }, el("div", { className: "moment-title", textContent: label }), ...strip(visualStrip(ability, when)), ...strip(sizeStrip(ability, when)), ...strip(soundStrip(ability, when)));
      card.dataset.moment = when;
      return card;
    }),
    ...strip(colorStrip(ability)),
  ];
}
