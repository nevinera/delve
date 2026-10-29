// Touch controls for phones, held in landscape: a thumbstick at the bottom left runs forward and
// back and strafes, and a jump button sits at the bottom right. Dragging anywhere else on the view
// turns the character and the camera together (the walker treats a touch drag as a right-drag).
// They press the walker's keys, so it moves as it would from a keyboard.

const DEAD = 0.35; // how far the stick goes, as a share of its reach, before it presses a key
const REACH_PX = 50;

// Which keys a thumbstick pushed by (dx, dy) pixels presses: w and s for up and down, q and e to
// strafe left and right.
export function stickKeys(dx, dy, reach = REACH_PX) {
  const [x, y] = [dx / reach, dy / reach];
  const keys = new Set();
  if (y < -DEAD) keys.add("w");
  if (y > DEAD) keys.add("s");
  if (x < -DEAD) keys.add("q");
  if (x > DEAD) keys.add("e");
  return keys;
}

// Whether this is a phone or tablet: a coarse pointer and no mouse.
export const isTouch = () => window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(any-pointer: fine)").matches;

export class TouchControls {
  // view: the RenderView you walk in. root: the element the controls go in.
  constructor(view, root) {
    this.view = view;
    this.pressed = new Set(); // the stick's keys, held on the walker
    document.body.classList.add("touch");
    root.insertAdjacentHTML(
      "beforeend",
      `<div class="touch-stick"><div class="touch-knob"></div></div><button type="button" class="touch-jump">jump</button>`,
    );
    this.stick = root.querySelector(".touch-stick");
    this.knob = root.querySelector(".touch-knob");
    this.jump = root.querySelector(".touch-jump");
    this.stick.addEventListener("pointerdown", (e) => this.stickDown(e));
    this.stick.addEventListener("pointermove", (e) => this.stickMove(e));
    for (const name of ["pointerup", "pointercancel"]) this.stick.addEventListener(name, () => this.stickUp());
    this.jump.addEventListener("pointerdown", (e) => (e.preventDefault(), this.view.walker?.held.add(" ")));
    for (const name of ["pointerup", "pointercancel", "pointerleave"]) this.jump.addEventListener(name, () => this.view.walker?.held.delete(" "));
  }

  stickDown(e) {
    e.preventDefault();
    try {
      this.stick.setPointerCapture(e.pointerId); // so the stick keeps the finger as it slides off
    } catch {
      // a pointer the browser no longer has: the stick works without
    }
    const box = this.stick.getBoundingClientRect();
    this.center = [box.left + box.width / 2, box.top + box.height / 2];
    this.stickMove(e);
  }

  stickMove(e) {
    if (!this.center) return;
    let [dx, dy] = [e.clientX - this.center[0], e.clientY - this.center[1]];
    const length = Math.hypot(dx, dy);
    if (length > REACH_PX) [dx, dy] = [(dx / length) * REACH_PX, (dy / length) * REACH_PX];
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    this.press(stickKeys(dx, dy));
  }

  stickUp() {
    this.center = null;
    this.knob.style.transform = "";
    this.press(new Set());
  }

  // Lets go of the keys the stick no longer presses, and presses the new ones.
  press(keys) {
    const held = this.view.walker?.held;
    if (!held) return;
    for (const key of this.pressed) if (!keys.has(key)) held.delete(key);
    for (const key of keys) held.add(key);
    this.pressed = keys;
  }
}
