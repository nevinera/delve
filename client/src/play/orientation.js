// On a phone, play is sideways. An installed app on Android can turn itself; a browser tab or an
// iPhone can't, so they ask you to turn the phone (play.css's .play-turn).

export async function turnSideways(orientation = globalThis.screen?.orientation) {
  if (!orientation?.lock) return false;
  try {
    await orientation.lock("landscape");
    return true;
  } catch {
    return false;
  }
}
