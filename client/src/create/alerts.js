// Alerts over the view: a line of text that stays SHOW_MS, then fades out over FADE_MS. The same
// text again while it's shown starts it over rather than showing twice.

const SHOW_MS = 6000;
const FADE_MS = 1000;
const MOST = 4; // alerts shown at once; older ones go

export function alert(text) {
  const box = document.getElementById("alerts");
  if (!box || !text) return;
  for (const old of box.children) if (old.textContent === text) old.remove();
  const line = document.createElement("div");
  line.className = "create-alert";
  line.textContent = text;
  box.append(line);
  while (box.children.length > MOST) box.firstElementChild.remove();
  setTimeout(() => line.classList.add("create-fading"), SHOW_MS);
  setTimeout(() => line.remove(), SHOW_MS + FADE_MS);
}
