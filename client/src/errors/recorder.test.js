import { describe, expect, it } from "vitest";
import { KEEP_LINES, MOST_REPORTS, QUIET_MS, createRecorder } from "./recorder.js";

function recorder() {
  const sent = [];
  let time = 0;
  const r = createRecorder({ send: (report) => sent.push(report), now: () => time, page: () => "/create", build: "abc", about: () => ({ graphics: "card" }) });
  return { r, sent, at: (ms) => (time = ms) };
}

describe("the error recorder", () => {
  it("sends an error with what was logged before it", () => {
    const { r, sent, at } = recorder();
    at(1500);
    r.note("log", ["tile", { tx: 1 }]);
    r.note("warn", [new Error("slow")]);
    r.report("boom", "at x.js:1:2");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ message: "boom", stack: "at x.js:1:2", page: "/create", build: "abc" });
    expect(sent[0].details).toMatchObject({ graphics: "card", seconds: 2, lines: ['1.5s log tile {"tx":1}', "1.5s warn Error: slow"] });
  });

  it("keeps only the latest lines", () => {
    const { r } = recorder();
    for (let i = 0; i < KEEP_LINES + 5; i++) r.note("log", [i]);
    expect(r.lines).toHaveLength(KEEP_LINES);
    expect(r.lines[0]).toContain("log 5");
  });

  it("doesn't send the same message again for a while, or too many in all", () => {
    const { r, sent, at } = recorder();
    r.report("same");
    r.report("same");
    at(QUIET_MS + 1);
    r.report("same");
    expect(sent).toHaveLength(2);
    for (let i = 0; i < MOST_REPORTS + 5; i++) r.report(`n${i}`);
    expect(sent).toHaveLength(MOST_REPORTS);
  });

  it("doesn't report an error raised while it's sending one", () => {
    const sent = [];
    const r = createRecorder({ send: (report) => (sent.push(report), r.report("loop")), now: () => 0, page: () => "/" });
    r.report("first");
    expect(sent.map((report) => report.message)).toEqual(["first"]);
  });
});
