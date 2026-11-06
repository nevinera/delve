// The log on the play page: lines of what's happened, and a box for typing commands. Enter or a
// slash opens the box. The game server reads what's typed and answers in the log, but for the
// page's own commands, which it runs itself.

const LINES = 200;
const SIZE_KEPT = "playLogSize"; // the size you've dragged it to, in localStorage
const MIN = [220, 60];

// What to send for what's typed, or an `error` to show, or nothing for an empty line. A command
// named in `local` (name -> run(args)) is the page's own: what's given is that command's run and
// the words after its name.
export function readLine(text, local = {}) {
  const line = text.trim();
  if (!line) return {};
  if (!line.startsWith("/")) return { error: "Commands start with /. Try /help." };
  const [name, ...args] = line.slice(1).split(/\s+/);
  if (Object.hasOwn(local, name)) return { run: local[name], args };
  return { send: line };
}

function keptSize() {
  try {
    const size = JSON.parse(localStorage.getItem(SIZE_KEPT));
    return Array.isArray(size) && size.length === 2 && size.every(Number.isFinite) ? size : null;
  } catch {
    return null;
  }
}

export class PlayLog {
  // send(line) sends a command to the game server. `local` holds the page's own commands, name ->
  // run(args), each giving the lines to answer with.
  constructor(send, local = {}) {
    this.send = send;
    this.local = local;
    this.lines = Object.assign(document.createElement("div"), { className: "play-log-lines" });
    this.box = Object.assign(document.createElement("input"), { className: "play-log-box", type: "text", placeholder: "/help", maxLength: 200, autocomplete: "off", spellcheck: false, hidden: true });
    this.box.setAttribute("aria-label", "command");
    this.grip = Object.assign(document.createElement("div"), { className: "play-log-grip", title: "Drag to resize" });
    this.root = Object.assign(document.createElement("div"), { className: "play-log" });
    this.root.append(this.grip, this.lines, this.box);
    this.grip.addEventListener("pointerdown", (e) => this.resizeFrom(e));
    this.sizeTo(keptSize());
    window.addEventListener("keydown", (e) => this.key(e), { capture: true });
  }

  // Drags the top right corner to resize it: it stays put at the bottom left.
  resizeFrom(down) {
    down.preventDefault();
    this.grip.setPointerCapture(down.pointerId);
    const from = [this.lines.offsetWidth, this.lines.offsetHeight, down.clientX, down.clientY];
    const move = (e) => this.sizeTo([from[0] + e.clientX - from[2], from[1] - (e.clientY - from[3])]);
    const up = () => {
      this.grip.removeEventListener("pointermove", move);
      this.grip.removeEventListener("pointerup", up);
      try {
        localStorage.setItem(SIZE_KEPT, JSON.stringify(this.size));
      } catch {}
    };
    this.grip.addEventListener("pointermove", move);
    this.grip.addEventListener("pointerup", up);
  }

  // [width, height] of its lines in px, or null for the size that suits the screen.
  sizeTo(size) {
    if (!size) return;
    const [w, h] = [Math.max(MIN[0], Math.min(window.innerWidth - 24, size[0])), Math.max(MIN[1], Math.min(window.innerHeight * 0.8, size[1]))];
    this.size = [Math.round(w), Math.round(h)];
    this.root.style.setProperty("--log-width", `${this.size[0]}px`);
    this.root.style.setProperty("--log-height", `${this.size[1]}px`);
    this.lines.scrollTop = this.lines.scrollHeight;
  }

  // kind: combat, system, error or debug. It keeps to the newest line, unless you've scrolled up.
  add(text, kind = "combat") {
    const atEnd = this.lines.scrollHeight - this.lines.scrollTop - this.lines.clientHeight < 4;
    this.lines.append(Object.assign(document.createElement("div"), { className: `play-log-${kind}`, textContent: text }));
    while (this.lines.children.length > LINES) this.lines.firstChild.remove();
    if (atEnd) this.lines.scrollTop = this.lines.scrollHeight;
  }

  open(text = "") {
    this.box.hidden = false;
    this.box.value = text;
    this.box.focus();
  }

  close() {
    this.box.value = "";
    this.box.hidden = true;
    this.box.blur();
  }

  key(e) {
    if (document.activeElement === this.box) {
      e.stopPropagation();
      if (e.key === "Escape") this.close();
      if (e.key !== "Enter") return;
      const { send, run, args, error } = readLine(this.box.value, this.local);
      if (send) this.send(send);
      if (run) for (const line of run(args)) this.add(line, "debug");
      if (error) this.add(error, "error");
      this.close();
      return;
    }
    if (e.repeat || ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
    if (e.key === "Enter" || e.key === "/") {
      e.preventDefault();
      e.stopPropagation();
      this.open(e.key === "/" ? "/" : "");
    }
  }
}
