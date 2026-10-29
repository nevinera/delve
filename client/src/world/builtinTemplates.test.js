import { describe, expect, it } from "vitest";
import { BUILTIN_IMAGES } from "./builtinImages.js";
import { BUILTIN_TEMPLATES } from "./builtinTemplates.js";
import { setBuiltObjects, specOf } from "./objects.js";
import { templateProblems } from "./templates.js";

describe("builtin templates", () => {
  it("are all sound, with unique ids, wearing builtin images and furnished with builtin objects", () => {
    setBuiltObjects([]);
    const images = new Set(BUILTIN_IMAGES.map((i) => i.id));
    const ids = new Set();
    for (const t of BUILTIN_TEMPLATES) {
      expect(templateProblems(t, images), t.name).toEqual([]);
      expect(ids.has(t.id), t.id).toBe(false);
      ids.add(t.id);
      for (const o of t.objects) expect(specOf(o.type)?.built, `${t.name}: ${o.type}`).toBeTruthy();
    }
  });
});
