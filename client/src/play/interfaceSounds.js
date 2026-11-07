import { SoundMixer } from "../abilities/sounds.js";

// The interface's sounds in play, quiet and from nowhere: a click for its buttons, a page turning
// as a window opens and a book shutting as one closes, and a soft "no" for real errors. Running
// short of energy and the like isn't an error. A press plays only its most telling sound, so a
// button that opens a window turns the page without the click.

export const INTERFACE_VOLUME = { "ui-click": 0.15, "ui-open": 0.25, "ui-close": 0.2, "ui-error": 0.3 };
const RANK = ["ui-click", "ui-close", "ui-open"]; // the last outranks the rest
// How long what one press sets off has to come together. A popover says it's toggled a task later.
const TOGETHER_MS = 30;

export class InterfaceSounds {
  // audio: gives the page's AudioContext. play(name, volume) and defer(fn), for tests to replace.
  constructor(audio, { play = null, defer = (fn) => setTimeout(fn, TOGETHER_MS) } = {}) {
    this.audio = audio;
    this.play = play ?? ((name, volume) => this.ready().play(name, { volume }));
    this.defer = defer;
    this.waiting = null;
  }

  // Its mixer, made on the first press so its sounds are decoded by the time a click lands.
  ready() {
    this.mixer ??= new SoundMixer(this.audio(), { limit: 4, names: Object.keys(INTERFACE_VOLUME) });
    return this.mixer;
  }

  click() {
    this.ask("ui-click");
  }

  opened() {
    this.ask("ui-open");
  }

  closed() {
    this.ask("ui-close");
  }

  error() {
    this.play("ui-error", INTERFACE_VOLUME["ui-error"]);
  }

  // What happens in one go plays once, at its highest rank.
  ask(name) {
    if (this.waiting) {
      if (RANK.indexOf(name) > RANK.indexOf(this.waiting)) this.waiting = name;
      return;
    }
    this.waiting = name;
    this.defer(() => {
      const name = this.waiting;
      this.waiting = null;
      this.play(name, INTERFACE_VOLUME[name]);
    });
  }

  // Clicks on the buttons inside `boxes`.
  clicks(...boxes) {
    for (const box of boxes) box?.addEventListener("click", (e) => e.target.closest?.("button:not(:disabled)") && this.click());
  }

  // Opening and closing `box`, as its `hidden` changes.
  window(box) {
    if (!box) return;
    let hidden = box.hidden;
    new MutationObserver(() => {
      if (box.hidden === hidden) return;
      hidden = box.hidden;
      if (hidden) this.closed();
      else this.opened();
    }).observe(box, { attributes: true, attributeFilter: ["hidden"] });
  }

  // Opening and closing a popover.
  popover(box) {
    box?.addEventListener("toggle", (e) => (e.newState === "open" ? this.opened() : this.closed()));
  }
}
