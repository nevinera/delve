// Picking how to record, putting what speech recognition hears into the note, and telling a
// blank screenshot.

const TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg", "audio/mp4"];

// The first recording type this browser can make, or "" to let it choose.
export function voiceType(isTypeSupported) {
  return TYPES.find((type) => isTypeSupported(type)) ?? "";
}

// The note as it reads with what's been heard: `before` typed already, then each result, final or
// not, as the recognizer's `results` list has them.
export function noteWith(before, results) {
  const heard = Array.from(results, (result) => result[0].transcript.trim()).filter(Boolean).join(" ");
  return [before.trim(), heard].filter(Boolean).join(before.trim() ? " " : "");
}

export const MOST_SECONDS = 120; // a voice note stops by itself this long in

export function clock(seconds) {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

// Whether an image's RGBA pixels are all one color: a canvas read after it was cleared.
export function blank(pixels, step = 97) {
  for (let i = step * 4; i < pixels.length; i += step * 4) {
    for (let c = 0; c < 3; c++) if (Math.abs(pixels[i + c] - pixels[c]) > 6) return false;
  }
  return true;
}
