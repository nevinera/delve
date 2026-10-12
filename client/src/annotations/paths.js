// Slash-separated paths, for following $refs between content files without
// node:path (so these modules run in the browser too).

export function dirname(path) {
  const i = path.lastIndexOf("/");
  return i < 0 ? "." : i === 0 ? "/" : path.slice(0, i);
}

// `to` from the directory `from`; an absolute `to` stands alone.
export function join(from, to) {
  return to.startsWith("/") ? to : `${from}/${to}`;
}

// Without "." segments, and ".." folded into the segment before it where
// there is one.
export function normalize(path) {
  const absolute = path.startsWith("/");
  const out = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === ".." && out.length && out[out.length - 1] !== "..") out.pop();
    else if (part !== ".." || !absolute) out.push(part);
  }
  return (absolute ? "/" : "") + (out.join("/") || (absolute ? "" : "."));
}
