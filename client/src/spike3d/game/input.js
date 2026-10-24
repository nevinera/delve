// Movement input: an on-screen joystick (stick: x right, y up, length
// <= 1) and the set of held keys.
export class MoveInput {
  constructor(container) {
    this.keys = new Set();
    this.stick = {x: 0, y: 0};
    this.el = document.createElement("div");
    this.el.className = "s3-joy";
    this.knob = document.createElement("div");
    this.knob.className = "knob";
    this.el.append(this.knob);
    container.append(this.el);

    let pointer = null;
    const move = (e) => {
      const r = this.el.getBoundingClientRect();
      const max = r.width / 2;
      let dx = e.clientX - (r.left + max), dy = e.clientY - (r.top + max);
      const len = Math.hypot(dx, dy);
      if (len > max) {
        dx = (dx / len) * max;
        dy = (dy / len) * max;
      }
      this.stick = {x: dx / max, y: -dy / max};
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    const end = () => {
      pointer = null;
      this.stick = {x: 0, y: 0};
      this.knob.style.transform = "";
    };
    this.el.addEventListener("pointerdown", (e) => {
      pointer = e.pointerId;
      this.el.setPointerCapture(e.pointerId);
      move(e);
      e.stopPropagation();
    });
    this.el.addEventListener("pointermove", (e) => e.pointerId === pointer && move(e));
    this.el.addEventListener("pointerup", end);
    this.el.addEventListener("pointercancel", end);

    window.addEventListener("keydown", (e) => {
      if (e.target.tagName !== "INPUT") this.keys.add(e.key.toLowerCase());
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener("blur", () => this.keys.clear());
  }

  setVisible(visible) {
    this.el.classList.toggle("hidden", !visible);
  }
}
