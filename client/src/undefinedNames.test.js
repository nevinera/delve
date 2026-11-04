import fs from "fs";
import path from "path";
import { Linter } from "eslint";
import globals from "globals";
import { describe, expect, it } from "vitest";

// A name nothing defines, like a forgotten import, only fails when that line runs, and tests don't
// run every line.
const root = path.dirname(new URL(import.meta.url).pathname);
const files = fs.readdirSync(root, { recursive: true }).filter((file) => file.endsWith(".js") && !file.endsWith(".test.js"));
const linter = new Linter();
const config = {
  languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: { ...globals.browser, ...globals.worker } },
  rules: { "no-undef": "error" },
};
const undefinedNames = (source) => linter.verify(source, config).map(({ line, message }) => `${line}: ${message}`);

describe("names in the client", () => {
  it("notices a name nothing defines", () => {
    expect(undefinedNames("await prepareAnimations();")).toEqual(["1: 'prepareAnimations' is not defined."]);
    expect(undefinedNames('import { a } from "./a.js";\nconst b = document.body;\na(b);')).toEqual([]);
  });

  it.each(files)("%s defines every name it uses", (file) => {
    expect(undefinedNames(fs.readFileSync(path.join(root, file), "utf8"))).toEqual([]);
  });
});
