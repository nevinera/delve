import { CELL_FT, CHUNK_FT, PLATE_FT, PLATTER_FT, TILE_FT } from "../v2/sizes.js";

// The grid drawn over the ground and the sea, shown at first (g shows or hides it): lines round cells, chunks,
// tiles, plates, platters and squares 8 platters across, thicker the bigger the square, a fixed number of pixels wide however far off. Each
// ground material draws only the squares as fine as its ground is drawn, and fades out lines
// too close together to read: less than 4 to 10 of their widths apart. Faces within about 5° of upright, like skirts, get none.

const LINES = [
  [CELL_FT, 1, 0.22],
  [CHUNK_FT, 1.5, 0.35],
  [TILE_FT, 2.5, 0.55],
  [PLATE_FT, 4, 0.75],
  [PLATTER_FT, 6, 0.85],
  [PLATTER_FT * 8, 9, 0.95],
]; // [spacing ft, width px, how dark]

export const grid = { value: 1 }; // 1 while it's shown, shared by every ground material

// Draws the grid over `material`, its squares `finest` ft and up.
export function withGrid(material, finest) {
  const compile = material.onBeforeCompile;
  const key = material.customProgramCacheKey;
  material.customProgramCacheKey = () => `${key.call(material)}-grid${finest}`;
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.uniforms.gridShown = grid;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vGridAt;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGridAt = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    const lines = LINES.filter(([spacing]) => spacing >= finest)
      .map(([spacing, px, dark]) => `on = max(on, ${dark.toFixed(2)} * gridLine(vGridAt.xz, ${spacing.toFixed(1)}, ${px.toFixed(1)}));`)
      .join("\n");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float gridShown;
        varying vec3 vGridAt;
        // How much of a line \`px\` pixels wide, round squares \`spacing\` ft, is at p.
        float gridLine(vec2 p, float spacing, float px) {
          vec2 w = max(fwidth(p), vec2(1e-4));
          vec2 off = abs(fract(p / spacing + 0.5) - 0.5) * spacing / w;
          vec2 line = 1.0 - smoothstep(px * 0.5 - 0.5, px * 0.5 + 0.5, off);
          return max(line.x, line.y) * smoothstep(4.0 * px, 10.0 * px, spacing / max(w.x, w.y));
        }`,
      )
      .replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>
        if (gridShown > 0.5) {
          vec3 n = normalize(cross(dFdx(vGridAt), dFdy(vGridAt)));
          float on = 0.0;
          ${lines}
          gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.05, 0.04, 0.03), on * smoothstep(0.05, 0.1, abs(n.y)));
        }`,
      );
  };
  return material;
}
