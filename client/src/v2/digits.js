// Base64 digits for text world files (plate.js, platter.js): A-Z a-z 0-9 + / stand for 0 to 63,
// and a number of n digits is written most significant first. Space, ~ and newline never appear
// in a number, so the files use them as marks.

export const DIGITS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const VALUE = new Int8Array(128).fill(-1);
for (let i = 0; i < 64; i++) VALUE[DIGITS.charCodeAt(i)] = i;

// The digit for 0 to 63.
export const digit = (n) => DIGITS[n];

// `n` (0 to 64 ** count - 1) as `count` digits.
export function digits(n, count) {
  let out = "";
  for (let k = count - 1; k >= 0; k--) out += DIGITS[(n >> (6 * k)) & 63];
  return out;
}

// The number `count` digits of `text` from `at` stand for.
export function readDigits(text, at, count) {
  let n = 0;
  for (let k = 0; k < count; k++) {
    const v = VALUE[text.charCodeAt(at + k)];
    if (v < 0) throw new Error(`not a digit: ${JSON.stringify(text[at + k])} at ${at + k}`);
    n = n * 64 + v;
  }
  return n;
}

// Bytes as digits, 3 bytes to 4 digits, the last group short (as base64 without padding).
export function bytesToDigits(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const left = Math.min(3, bytes.length - i);
    out += digits(n, 4).slice(0, left + 1);
  }
  return out;
}

export function digitsToBytes(text) {
  const bytes = new Uint8Array(Math.floor((text.length * 3) / 4));
  let at = 0;
  for (let i = 0; i < text.length; i += 4) {
    const group = text.slice(i, i + 4);
    const n = readDigits(group.padEnd(4, "A"), 0, 4);
    for (let k = 0; k < group.length - 1; k++) bytes[at++] = (n >> (16 - 8 * k)) & 255;
  }
  return bytes;
}
