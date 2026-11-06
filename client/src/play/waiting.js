// What the server says to a part of the play page before that part's there, such as combat or
// the others in view: each message kept until the part arrives, then handed to it in order.
export class Waiting {
  constructor() {
    this.part = null;
    this.kept = []; // [method, message], oldest first
  }

  // Hands `message` to the part's `method`, or keeps it till the part arrives: keep is "all" to
  // keep every one, "last" to keep only the latest, or "none" to keep none.
  send(method, message, keep = "all") {
    if (this.part) return this.part[method](message);
    if (keep === "none") return;
    if (keep === "last") this.kept = this.kept.filter(([kept]) => kept !== method);
    this.kept.push([method, message]);
  }

  // A handler for the game's messages that sends them to `method`, keeping them as `keep` says.
  to(method, keep = "all") {
    return (message) => this.send(method, message, keep);
  }

  // The part's here: it gets what was kept, and from now on, what's sent.
  arrive(part) {
    this.part = part;
    for (const [method, message] of this.kept) part[method](message);
    this.kept = [];
  }
}
