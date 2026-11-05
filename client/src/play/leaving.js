// Logging off: the server makes you wait out of combat, standing still, and says when you're done.
// Exiting now just leaves the page, and the server keeps your character in the world a while.

// What the countdown shows with `ms` to go.
export const secondsLeft = (ms) => Math.max(0, Math.ceil(ms / 1000));

export class Leaving {
  // panel: the countdown, with [data-left] for the seconds and an exit link. go(url): leaves the page.
  constructor({ connection, panel, button, go = (url) => window.location.assign(url) }) {
    Object.assign(this, { connection, panel, go, timer: null, ends: 0 });
    this.exit = panel.querySelector("[data-exit]");
    button.addEventListener("click", () => {
      button.closest("[popover]")?.hidePopover?.();
      this.connection.logOff();
    });
  }

  // The server's loggingOff.
  started({ seconds }) {
    this.ends = performance.now() + seconds * 1000;
    this.panel.hidden = false;
    const show = () => (this.panel.querySelector("[data-left]").textContent = secondsLeft(this.ends - performance.now()));
    show();
    clearInterval(this.timer);
    this.timer = setInterval(show, 250);
  }

  // The server's logOffStopped.
  stopped() {
    clearInterval(this.timer);
    this.panel.hidden = true;
  }

  // The server's loggedOff.
  done() {
    this.stopped();
    this.go(this.exit.href);
  }
}
