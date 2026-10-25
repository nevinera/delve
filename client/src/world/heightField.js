// The broad shape of the land: a thin-plate spline through every height pin, the smoothest surface
// that passes through them all, like a sheet of metal bent through each pin. It's clamped to the
// pins' range so it can't overshoot, and far from every pin it eases to a default height.
//
// Points are feet in continent space. Solving happens once per continent; each point is then a sum
// over the pins.

const UNIT = 1000; // the spline works in thousands of feet, to keep the solve well conditioned
const FAR = { start: 3000, end: 8000 }; // ft from the nearest pin over which it eases to the default

const phi = (r) => (r > 0 ? r * r * Math.log(r) : 0);

// pins: [{ x, z, height }]. Returns heightAt(x, z).
export function prepareHeights(pins, defaultHeight) {
  if (!pins.length) return () => defaultHeight;
  const pts = pins.map((p) => [p.x / UNIT, p.z / UNIT, p.height]);
  const low = Math.min(...pins.map((p) => p.height));
  const high = Math.max(...pins.map((p) => p.height));
  // With fewer than three pins, or all in a line, the tilt terms can't be pinned down, so the
  // spline goes without them.
  const fit = solve(pts, true) ?? solve(pts, false);

  return (x, z) => {
    const u = x / UNIT;
    const v = z / UNIT;
    let h = fit.affine[0] + fit.affine[1] * u + fit.affine[2] * v;
    let nearest = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const r = Math.hypot(u - pts[i][0], v - pts[i][1]);
      h += fit.weights[i] * phi(r);
      nearest = Math.min(nearest, r);
    }
    h = Math.max(low, Math.min(high, h));
    const t = smoothstep(FAR.start / UNIT, FAR.end / UNIT, nearest);
    return h + (defaultHeight - h) * t;
  };
}

// Weights and affine terms for the spline through pts ([u, v, height]), or null when the system
// is singular. With `tilt` off, the affine part is a constant only.
function solve(pts, tilt) {
  const n = pts.length;
  const m = tilt ? 3 : 1;
  const size = n + m;
  const a = Array.from({ length: size }, () => new Float64Array(size + 1));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) a[i][j] = phi(Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]));
    const affine = tilt ? [1, pts[i][0], pts[i][1]] : [1];
    affine.forEach((value, k) => {
      a[i][n + k] = value;
      a[n + k][i] = value;
    });
    a[i][size] = pts[i][2];
  }
  const x = gauss(a);
  if (!x) return null;
  return { weights: x.slice(0, n), affine: tilt ? x.slice(n) : [x[n], 0, 0] };
}

// Solves an augmented matrix in place by Gaussian elimination with partial pivoting.
function gauss(a) {
  const n = a.length;
  for (let c = 0; c < n; c++) {
    let pivot = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[pivot][c])) pivot = r;
    if (Math.abs(a[pivot][c]) < 1e-9) return null;
    [a[c], a[pivot]] = [a[pivot], a[c]];
    for (let r = c + 1; r < n; r++) {
      const f = a[r][c] / a[c][c];
      if (f === 0) continue;
      for (let k = c; k <= n; k++) a[r][k] -= f * a[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let sum = a[r][n];
    for (let k = r + 1; k < n; k++) sum -= a[r][k] * x[k];
    x[r] = sum / a[r][r];
  }
  return x;
}

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
