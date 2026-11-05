// On a phone, play is sideways. Where the browser lets a page turn itself, it does; Chrome on
// Android often only lets it in fullscreen, which takes a tap, so the prompt to turn the phone
// (play.css's .play-turn) offers a button for that. An iPhone can do neither, so it only asks.

export async function turnSideways(orientation = globalThis.screen?.orientation) {
  if (!orientation?.lock) return false;
  try {
    await orientation.lock("landscape");
    return true;
  } catch (err) {
    console.warn(`Couldn't turn sideways: ${err.message}`);
    return false;
  }
}

// Fullscreen, then sideways: what the button does. It needs the tap, so it's called from one.
export async function fullscreenSideways(root = document.documentElement, orientation = globalThis.screen?.orientation) {
  try {
    await root.requestFullscreen?.({ navigationUI: "hide" });
  } catch (err) {
    console.warn(`Couldn't go fullscreen: ${err.message}`);
  }
  return turnSideways(orientation);
}

// Shows the button where it can work: a page that can go fullscreen and lock its orientation.
export function offerSideways(button, root = document.documentElement, orientation = globalThis.screen?.orientation) {
  if (!button || !root.requestFullscreen || !orientation?.lock) return;
  button.hidden = false;
  button.addEventListener("click", () => fullscreenSideways(root, orientation));
}
