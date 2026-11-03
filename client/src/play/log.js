// The log on the play page: lines of what's happened, and a box for typing commands. Enter or a
// slash opens the box. The game server reads what's typed and answers in the log.

const LINES = 80;

// What to send for what's typed, or an `error` to show, or nothing for an empty line.
export function readLine(text) {
  const line = text.trim();
  if (!line) return {};
  if (!line.startsWith("/")) return { error: "Commands start with /. Try /help." };
  return { send: line };
}

export class PlayLog {
  // send(line) sends a command to the game server.
  constructor(send) {
    this.send = send;
    this.lines = Object.assign(document.createElement("div"), { className: "play-log-lines" });
    this.box = Object.assign(document.createElement("input"), { className: "play-log-box", type: "text", placeholder: "/help", maxLength: 200, autocomplete: "off", spellcheck: false, hidden: true });
    this.box.setAttribute("aria-label", "command");
    this.root = Object.assign(document.createElement("div"), { className: "play-log" });
    this.root.append(this.lines, this.box);
    window.addEventListener("keydown", (e) => this.key(e), { capture: true });
  }

  // kind: combat, system, error or debug.
  add(text, kind = "combat") {
    this.lines.append(Object.assign(document.createElement("div"), { className: `play-log-${kind}`, textContent: text }));
    while (this.lines.children.length > LINES) this.lines.firstChild.remove();
    this.lines.scrollTop = this.lines.scrollHeight;
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
      const { send, error } = readLine(this.box.value);
      if (send) this.send(send);
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
