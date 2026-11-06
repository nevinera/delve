// The log on the play page: lines of what's happened, and a box for typing commands. Enter or a
// slash opens the box, and up and down in it go back through what you've typed. The game server
// reads what's typed and answers in the log, but for the page's own commands, which it runs itself.

import { keyBindings } from "./keys.js";

const LINES = 200;
const SIZE_KEPT = "playLogSize"; // the size you've dragged it to, in localStorage
const FONT_KEPT = "playLogFont"; // its text size in px, in localStorage
const TYPED_KEPT = "playLogTyped"; // what you've typed lately, in localStorage
const MIN = [220, 60];
const FONT_PX = [10, 24]; // the smallest and largest its text goes
const TYPED = 50; // how many typed lines it remembers
const BAR_GAP = 8; // how far short of the action bars it stops, in px

// How wide the log can be between its left edge and the action bars' (px, from the window's left),
// or `hidden` where that room is narrower than the log's least width. With no bars there's no limit.
export function logRoom(logLeft, barLeft) {
  if (!Number.isFinite(barLeft)) return { width: Infinity, hidden: false };
  const width = Math.floor(barLeft - logLeft - BAR_GAP);
  return { width, hidden: width < MIN[0] };
}

// What each line in the log is, which gives it its color (play.css): reply, an answer to what you
// typed or did; status, what's happened to you or the world; error, for errors and warnings;
// combat, what's landed in a fight; and debug, the server's combat debug lines.
export const TYPES = ["reply", "status", "error", "combat", "debug"];
// The server's older name for both replies and statuses.
const OLD_TYPES = { system: "status" };
export const typeOf = (type) => (TYPES.includes(type) ? type : (OLD_TYPES[type] ?? "status"));

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

function kept(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function keep(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function keptSize() {
  const size = kept(SIZE_KEPT);
  return Array.isArray(size) && size.length === 2 && size.every(Number.isFinite) ? size : null;
}

// What you've typed, newest last, to step back through. up() and down() give the line to show, with
// what you'd started typing kept to come back to at the bottom.
export class Typed {
  constructor(lines = []) {
    this.lines = lines.slice(-TYPED);
    this.at = this.lines.length;
  }

  add(line) {
    if (line && line !== this.lines.at(-1)) this.lines.push(line);
    this.lines = this.lines.slice(-TYPED);
    this.at = this.lines.length;
    this.draft = "";
  }

  up(current) {
    if (this.at === this.lines.length) this.draft = current;
    this.at = Math.max(0, this.at - 1);
    return this.lines[this.at] ?? current;
  }

  down() {
    this.at = Math.min(this.lines.length, this.at + 1);
    return this.at === this.lines.length ? (this.draft ?? "") : this.lines[this.at];
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
    const button = (text, title, step) => {
      const made = Object.assign(document.createElement("button"), { type: "button", className: "play-log-font", textContent: text, title });
      made.tabIndex = -1;
      // It never takes the keyboard, so space still jumps after a click.
      made.addEventListener("pointerdown", (e) => e.preventDefault());
      made.addEventListener("click", () => this.fontTo(this.font + step));
      return made;
    };
    this.fonts = Object.assign(document.createElement("div"), { className: "play-log-fonts" });
    this.fonts.append(button("A−", "Smaller text", -1), button("A+", "Larger text", 1));
    this.root = Object.assign(document.createElement("div"), { className: "play-log" });
    this.root.append(this.fonts, this.grip, this.lines, this.box);
    this.grip.addEventListener("pointerdown", (e) => this.resizeFrom(e));
    // Ctrl or cmd and the wheel, over the log, sizes its text too.
    this.lines.addEventListener("wheel", (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      this.fontTo(this.font - Math.sign(e.deltaY));
    });
    this.typed = new Typed(Array.isArray(kept(TYPED_KEPT)) ? kept(TYPED_KEPT) : []);
    this.sizeTo(keptSize());
    const font = kept(FONT_KEPT);
    if (Number.isFinite(font)) this.fontTo(font, false);
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
      keep(SIZE_KEPT, this.size);
    };
    this.grip.addEventListener("pointermove", move);
    this.grip.addEventListener("pointerup", up);
  }

  // [width, height] of its lines in px, or null for the size that suits the screen.
  sizeTo(size) {
    if (!size) return;
    const [w, h] = [Math.max(MIN[0], Math.min(window.innerWidth - 24, this.room ?? Infinity, size[0])), Math.max(MIN[1], Math.min(window.innerHeight * 0.8, size[1]))];
    this.size = [Math.round(w), Math.round(h)];
    this.root.style.setProperty("--log-width", `${this.size[0]}px`);
    this.root.style.setProperty("--log-height", `${this.size[1]}px`);
    this.lines.scrollTop = this.lines.scrollHeight;
  }

  // Keeps the log short of `bars`, the action bars, as they and the window change size. Where
  // there's too little room it hides, as on a phone, until you open the box to type.
  keepLeftOf(bars) {
    this.bars = bars;
    const fit = () => this.fit();
    new ResizeObserver(fit).observe(bars);
    window.addEventListener("resize", fit);
    fit();
  }

  fit() {
    const box = this.bars?.getBoundingClientRect();
    // Its left from the style sheet, which it has even while it's hidden.
    const { width, hidden } = logRoom(parseFloat(getComputedStyle(this.root).left) || 0, box?.width ? box.left : NaN);
    this.room = Number.isFinite(width) ? width : null;
    this.root.style.setProperty("--log-room", this.room === null ? "100vw" : `${Math.max(width, 0)}px`);
    this.root.classList.toggle("play-log-narrow", hidden);
  }

  // The text's size in px, which it keeps in this browser.
  get font() {
    return this.fontPx ?? parseFloat(getComputedStyle(this.root).fontSize);
  }

  fontTo(px, kept = true) {
    this.fontPx = Math.max(FONT_PX[0], Math.min(FONT_PX[1], Math.round(px)));
    this.root.style.setProperty("--log-font", `${this.fontPx}px`);
    this.lines.scrollTop = this.lines.scrollHeight;
    if (kept) keep(FONT_KEPT, this.fontPx);
  }

  // type: one of TYPES, which colors it. It keeps to the newest line, unless you've scrolled up.
  add(text, type = "combat") {
    const atEnd = this.lines.scrollHeight - this.lines.scrollTop - this.lines.clientHeight < 4;
    const line = Object.assign(document.createElement("div"), { className: `play-log-line play-log-${typeOf(type)}`, textContent: text });
    line.dataset.type = typeOf(type);
    this.lines.append(line);
    while (this.lines.children.length > LINES) this.lines.firstChild.remove();
    if (atEnd) this.lines.scrollTop = this.lines.scrollHeight;
  }

  open(text = "") {
    this.box.hidden = false;
    this.root.classList.add("play-log-typing");
    this.box.value = text;
    this.box.focus();
  }

  close() {
    this.box.value = "";
    this.box.hidden = true;
    this.root.classList.remove("play-log-typing");
    this.box.blur();
  }

  key(e) {
    if (document.activeElement === this.box) {
      e.stopPropagation();
      if (e.key === "Escape") this.close();
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        this.box.value = e.key === "ArrowUp" ? this.typed.up(this.box.value) : this.typed.down();
        this.box.setSelectionRange(this.box.value.length, this.box.value.length);
        return;
      }
      if (e.key !== "Enter") return;
      this.typed.add(this.box.value.trim());
      keep(TYPED_KEPT, this.typed.lines);
      const { send, run, args, error } = readLine(this.box.value, this.local);
      if (send) this.send(send);
      if (run) for (const line of run(args)) this.add(line, "reply");
      if (error) this.add(error, "error");
      this.close();
      return;
    }
    if (e.repeat || keyBindings().recording || ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
    const action = keyBindings().actionFor(e)?.id;
    if (action === "chat" || action === "command") {
      e.preventDefault();
      e.stopPropagation();
      this.open(action === "command" ? "/" : "");
    }
  }
}
