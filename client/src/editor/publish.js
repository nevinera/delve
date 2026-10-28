import { GithubAuthError, GithubClient } from "../github/github.js";
import { delta, latestVersion, fileSize, nextVersion, storedChanges } from "./githubWorld.js";
import { validateStored } from "./validation.js";

// The publish step: a world opened from GitHub is published by tagging its saved commit as a
// version (v1, v2, ...) once it passes the validator (world/validate.js). Saving doesn't validate;
// publishing won't tag a commit until validating what's saved there finds no problems.

const SHOWN_PROBLEMS = 50;
const TAG_NAME = /^(?!.*\.\.)[A-Za-z0-9][\w.-]*$/;

export class PublishPanel {
  // el: the step's elements. world() and source() give the world and where it came from (main.js),
  // beforeStore() brings its indexes up to date, and pool packs its plates.
  constructor(el, { world, source, beforeStore, pool }) {
    this.el = el;
    this.world = world;
    this.source = source;
    this.beforeStore = beforeStore;
    this.pool = pool;
    this.tags = [];
    this.validated = null; // { key, ok }: what was validated, and whether it passed
    this.current = null; // { key, unsaved } as of the last refresh
    this.busy = false;
    this.tagEdited = false;
    this.publishedFiles = new Map(); // commit sha -> its files
    el.validate.addEventListener("click", () => this.validate());
    el.publish.addEventListener("click", () => this.publish());
    el.tag.addEventListener("input", () => {
      this.tagEdited = true;
      this.update();
    });
  }

  // The world's changed, so what was validated isn't what's there now.
  invalidate() {
    this.current = null;
    this.update();
  }

  // Works out where the world stands: its size, what's unsaved, and its versions on GitHub.
  async refresh() {
    const source = this.source();
    this.el.facts.replaceChildren();
    if (!source) {
      this.el.where.textContent = "Publishing needs a world opened from GitHub. Open one from your worlds on the home page.";
      this.current = null;
      return this.update();
    }
    this.el.where.textContent = `Publishes ${source.repo} by tagging its saved commit on ${source.branch}.`;
    this.working("Looking at the world...");
    try {
      const { stored, shas, unsaved } = await this.state(source);
      const sizes = Object.fromEntries([...stored].map(([path, bytes]) => [path, bytes.length]));
      const facts = [
        ["saved", source.commitSha ? source.commitSha.slice(0, 7) : "nothing yet"],
        ["unsaved", unsaved ? `${unsaved} changed files: save before publishing` : "nothing"],
        ["world", `${stored.size} files, ${fileSize(Object.values(sizes).reduce((a, b) => a + b, 0))}`],
      ];
      const client = new GithubClient(source.repo);
      this.tags = await client.tags();
      const latest = latestVersion(this.tags);
      if (latest) {
        const info = await client.commitInfo(latest.sha);
        if (!this.publishedFiles.has(latest.sha)) this.publishedFiles.set(latest.sha, await client.files(latest.sha));
        const change = delta(this.publishedFiles.get(latest.sha), shas, sizes);
        facts.unshift(["published", `${latest.name}, ${latest.sha.slice(0, 7)}, ${new Date(info.date).toLocaleString()}`]);
        facts.splice(3, 0, [`since ${latest.name}`, change.files ? `${change.files} files, ${fileSize(change.bytes)}` : "no changes"]);
      } else facts.unshift(["published", "never"]);
      this.showFacts(facts);
      if (!this.tagEdited || this.tagTaken()) {
        this.el.tag.value = nextVersion(this.tags);
        this.tagEdited = false;
      }
      this.done("");
    } catch (err) {
      this.done(err instanceof GithubAuthError ? "Connect GitHub to publish, on your home page." : `Couldn't look at ${source.repo}: ${err.message}`, true);
    }
  }

  // Checks the world as it would be stored, listing the first problems found.
  async validate() {
    const source = this.source();
    this.working("Validating...");
    this.el.problems.hidden = true;
    try {
      const { stored, key } = await this.state(source);
      const found = await validateStored(stored);
      const errors = found.filter((p) => !p.warning);
      const warnings = found.filter((p) => p.warning);
      this.validated = { key, ok: !errors.length };
      const shown = [...errors, ...warnings].slice(0, SHOWN_PROBLEMS);
      this.el.problems.replaceChildren(
        ...shown.map(({ path, message, warning }) => {
          const li = document.createElement("li");
          li.textContent = `${warning ? "warning: " : ""}${path}: ${message}`;
          li.classList.toggle("warning", warning);
          return li;
        }),
      );
      this.el.problems.hidden = !shown.length;
      const counts = `${errors.length} problem${errors.length === 1 ? "" : "s"}, ${warnings.length} warning${warnings.length === 1 ? "" : "s"}`;
      const more = found.length > SHOWN_PROBLEMS ? ` (showing the first ${SHOWN_PROBLEMS})` : "";
      this.el.validateInfo.textContent = errors.length ? `${counts}${more}. Fix the problems to publish.` : `Passed, with ${warnings.length} warning${warnings.length === 1 ? "" : "s"}${more}.`;
      this.el.validateInfo.className = errors.length ? "editor-message" : "editor-message info";
      this.done("");
    } catch (err) {
      this.validated = null;
      this.done(`Couldn't validate: ${err.message}`, true);
    }
  }

  // Tags the saved commit, if it's what passed the validator.
  async publish() {
    const source = this.source();
    const name = this.el.tag.value.trim();
    this.working(`Publishing ${name}...`);
    try {
      const { key, unsaved } = await this.state(source);
      if (unsaved) throw new Error("the world has changes that aren't saved");
      if (this.validated?.key !== key || !this.validated.ok) throw new Error("validate the world again first");
      const client = new GithubClient(source.repo);
      this.tags = await client.tags();
      if (this.tagTaken()) throw new Error(`${name} is taken`);
      if (this.publishedAs()) throw new Error(`this commit is published as ${this.publishedAs()}`);
      await client.createTag(name, source.commitSha);
      this.tagEdited = false;
      await this.refresh();
      this.done(`Published ${name} at ${source.commitSha.slice(0, 7)}.`);
    } catch (err) {
      this.done(err instanceof GithubAuthError ? "Connect GitHub to publish, on your home page." : `Couldn't publish ${name}: ${err.message}`, true);
    }
  }

  // The world as it would be stored: its files, a key for what they are, and how many differ from
  // what's saved.
  async state(source) {
    this.beforeStore();
    const { stored, shas, changes } = await storedChanges(this.world(), source, { pool: this.pool });
    const key = JSON.stringify(Object.entries(shas).sort());
    this.current = { key, unsaved: Object.keys(changes).length };
    return { stored, shas, key, unsaved: this.current.unsaved };
  }

  // The version the saved commit is published as already, if it is.
  publishedAs() {
    const sha = this.source()?.commitSha;
    return (sha && this.tags.find((t) => t.sha === sha)?.name) ?? null;
  }

  tagTaken() {
    return this.tags.some((t) => t.name === this.el.tag.value.trim());
  }

  showFacts(facts) {
    this.el.facts.replaceChildren(
      ...facts.flatMap(([term, value]) => {
        const dt = document.createElement("dt");
        dt.textContent = term;
        const dd = document.createElement("dd");
        dd.textContent = value;
        return [dt, dd];
      }),
    );
  }

  working(text) {
    this.busy = true;
    this.say(text);
    this.update();
  }

  done(text, error = false) {
    this.busy = false;
    this.say(text, error);
    this.update();
  }

  say(text, error = false) {
    this.el.info.textContent = text;
    this.el.info.className = error ? "editor-message" : "editor-message info";
  }

  // The buttons, as far as what's known allows.
  update() {
    const source = this.source();
    const name = this.el.tag.value.trim();
    const passed = Boolean(this.validated?.ok && this.current && this.validated.key === this.current.key);
    this.el.validate.disabled = this.busy || !source;
    this.el.tag.disabled = this.busy || !source;
    const already = this.publishedAs();
    this.el.publish.disabled = this.busy || !source?.commitSha || !passed || Boolean(this.current?.unsaved) || Boolean(already) || !TAG_NAME.test(name) || this.tagTaken();
    const failed = Boolean(this.validated && !this.validated.ok && this.current && this.validated.key === this.current.key);
    this.el.publish.title = failed ? "Fix the problems the validator found" : !passed ? "Validate the world first" : this.current?.unsaved ? "Save first" : already ? `This commit is published as ${already}` : this.tagTaken() ? `${name} is taken` : !TAG_NAME.test(name) ? "Give a tag name: letters, digits, . - and _" : "";
  }
}
