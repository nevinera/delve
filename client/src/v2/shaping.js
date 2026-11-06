import { LEDGE_RAISE_FT, LEVEE_FT, pooledAt, shape } from "./courses.js";
import { fordAt, roadsAt } from "./roads.js";

// Where courses (courses.js) and roads (roads.js) put the ground at a cell corner (x, z), the
// ground there being `base` before they moved it. Each course cuts it down (shape), or where none
// does, builds it up a little where a bank's lower than the water, or more under a fall's ledge.
// Then, out of the courses' water and pools, the road there has its way (roadsAt); in a stream's
// water or its pools, the road builds its bed up to a ford (fordAt). `pools` are the courses'
// pools nearby (poolsIn), which only matter where there are roads.
export function shapedAt(x, z, base, courses, roads = [], pools = []) {
  let [top, levee, wet, ford] = [base, base, false, null];
  for (const course of courses) {
    const made = shape(course, x, z);
    if (!made) continue;
    top = Math.min(top, made.top);
    levee = Math.max(levee, Math.min(made.levee, base + (made.ledge ? LEDGE_RAISE_FT : LEVEE_FT)));
    wet ||= made.wet;
    // Only a stream's fordable, and not where it runs into a river.
    if (made.wet) ford = course.type === "stream" && ford !== false ? Math.max(ford ?? -Infinity, made.level) : false;
  }
  if (top === base) top = levee;
  if (!roads.length) return top;
  const pool = pools.length ? pooledAt(pools, x, z) : null;
  if (pool) {
    wet = true;
    if (ford !== false) ford = pool.course.type === "stream" ? Math.max(ford ?? -Infinity, pool.level) : false;
  }
  if (!wet) return roadsAt(roads, x, z, top);
  return typeof ford === "number" ? fordAt(roads, x, z, top, ford) : top;
}
