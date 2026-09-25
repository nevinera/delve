import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { webcrypto } from "node:crypto";

// jsdom's own window.crypto implements getRandomValues but not subtle - the
// vm context vitest runs each file in under pool:'vmThreads' shadows
// Node's own globalThis.crypto (which has subtle) with jsdom's, unlike the
// default pool where Node's happens to show through.
if (!crypto.subtle) {
  crypto.subtle = webcrypto.subtle;
}

// jsdom doesn't implement scrollIntoView at all (unlike real browsers).
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// jsdom doesn't implement the Pointer Events capture methods either.
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

// jsdom doesn't implement Blob object URLs at all - real browsers always do.
if (!URL.createObjectURL) {
  URL.createObjectURL = () => "blob:mock-url";
  URL.revokeObjectURL = () => {};
}

afterEach(() => {
  cleanup();
});
