// The log on the play page: lines of what's happened, and a box for typing commands. Enter or a
// slash opens the box. The game server reads what's typed and answers in the log, but for the
// page's own commands, which it runs itself.

const LINES = 80;

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

export class PlayLog {
  // send(line) sends a command to the game server. `local` holds the page's own commands, name ->
  // run(args), each giving the lines to answer with.
  constructor(send, local = {}) {
    this.send = send;
    this.local = local;
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
