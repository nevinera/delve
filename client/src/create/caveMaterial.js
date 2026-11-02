import * as THREE from "three";
import { CAVE_THEMES } from "../v2/caves.js";

// The material cave rock is drawn with (caveMesh.js), its positions in continent feet. Caves are lit evenly from everywhere, as the
// night sky lights the surface, so what faces up is a little lighter than what faces down. Each
// theme gives the stone its own texture, made in the shader from noise over continent feet: a
// height that shades the color and tilts the way the rock seems to face. Jagged rock is drawn
// flat across each face, so it breaks into facets. Smooth rock has a wet sheen at glancing angles.
// Caves fade into the dark with distance instead of into the sky. A brush's patch (setBrush) is
// drawn lighter: the rock within its radius of its middle that faces about its way. Rock near a
// mouth's lip (caveDay, 0 to 1) is lit by the day instead, as the ground round it is.

const LIGHT = 0x6a7088; // what cave rock's colors are lit by, about the surface's by night
const FOG = { color: 0x0c0d12, nearFt: 20, farFt: 160 };
const SHADE = { down: 0.5, up: 1.2 }; // the light on what faces down, and up
const DAY = { light: 0.85, down: 0.55, up: 1 }; // the day's light on rock at a mouth's lip, and on what faces down and up

const f = (v) => v.toFixed(4);
const THEME = Object.fromEntries(CAVE_THEMES.map((name, n) => [name, f(n)]));

const VERTEX = `
attribute float caveTheme;
attribute float caveDay;
varying vec3 vCavePos;
varying vec3 vCaveNormal;
varying float vCaveTheme;
varying float vCaveDay;
`;

const FRAGMENT = `
uniform vec4 caveBrush;
uniform vec3 caveBrushNormal;
varying vec3 vCavePos;
varying vec3 vCaveNormal;
varying float vCaveTheme;
varying float vCaveDay;

float caveHash( vec3 p ) {
  p = fract( p * 0.3183099 + 0.1 );
  p *= 17.0;
  return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
}

float caveNoise( vec3 x ) {
  vec3 i = floor( x );
  vec3 f = fract( x );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix(
    mix( mix( caveHash( i ), caveHash( i + vec3( 1, 0, 0 ) ), f.x ), mix( caveHash( i + vec3( 0, 1, 0 ) ), caveHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
    mix( mix( caveHash( i + vec3( 0, 0, 1 ) ), caveHash( i + vec3( 1, 0, 1 ) ), f.x ), mix( caveHash( i + vec3( 0, 1, 1 ) ), caveHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ),
    f.z );
}

float caveFbm( vec3 p ) {
  float sum = 0.0;
  float amp = 0.5;
  for ( int i = 0; i < 4; i++ ) {
    sum += amp * caveNoise( p );
    p *= 2.03;
    amp *= 0.5;
  }
  return sum / 0.9375;
}

// The stone's height at p, about 0 to 1, and how strongly it tilts the surface.
vec2 caveStone( vec3 p, float theme ) {
  if ( theme < ${THEME.smooth} - 0.5 ) {
    // Jagged: rough grain over the facets.
    return vec2( caveFbm( p * 1.1 ), 0.5 );
  }
  if ( theme < ${THEME.carved} - 0.5 ) {
    // Smooth: broad swells, barely any grain.
    return vec2( 0.75 * caveFbm( p * 0.12 ) + 0.25 * caveNoise( p * 0.6 ), 0.5 );
  }
  if ( theme < ${THEME.mined} - 0.5 ) {
    // Carved: slanting chisel strokes over fine grain.
    float strokes = caveNoise( vec3( p.x * 0.7 + p.y * 2.2, p.y * 0.25, p.z * 0.7 + p.y * 2.2 ) );
    return vec2( 0.55 * strokes + 0.45 * caveFbm( p * 1.6 ), 0.45 );
  }
  // Mined: level gouges from picks.
  float gouges = caveNoise( vec3( p.x * 0.45, p.y * 2.4, p.z * 0.45 ) );
  return vec2( 0.6 * gouges + 0.4 * caveFbm( p * 0.9 ), 1.0 );
}

// The normal n tilted by a height h over the surface at p (bump mapping from screen derivatives).
vec3 caveBump( vec3 n, vec3 p, float h, float strength ) {
  vec3 dpx = dFdx( p );
  vec3 dpy = dFdy( p );
  float dhx = dFdx( h ) * strength;
  float dhy = dFdy( h ) * strength;
  vec3 r1 = cross( dpy, n );
  vec3 r2 = cross( n, dpx );
  float det = dot( dpx, r1 );
  vec3 grad = sign( det ) * ( dhx * r1 + dhy * r2 );
  return normalize( abs( det ) * n - grad );
}
`;

const SHADING = `
  vec2 stone = caveStone( vCavePos, vCaveTheme );
  vec3 caveBase = normalize( vCaveNormal );
  bool jagged = vCaveTheme < ${THEME.smooth} - 0.5;
  if ( jagged ) {
    // Flat across each face.
    vec3 facet = normalize( cross( dFdx( vCavePos ), dFdy( vCavePos ) ) );
    caveBase = dot( facet, caveBase ) < 0.0 ? -facet : facet;
  }
  // By a mouth's lip, the stone's grain fades to half, as the ground's own does there.
  float grainShare = 1.0 - 0.5 * vCaveDay;
  vec3 caveN = caveBump( caveBase, vCavePos, stone.x, stone.y * grainShare );
  diffuseColor.rgb *= ( 1.0 + 0.4 * ( stone.x - 0.5 ) * grainShare ) * mix( ${f(SHADE.down)}, ${f(SHADE.up)}, caveN.y * 0.5 + 0.5 );
  if ( vCaveDay > 0.0 ) {
    vec3 dayLit = pow( vColor.rgb, vec3( 2.2 ) ) * ${f(DAY.light)} * ( 1.0 + 0.4 * ( stone.x - 0.5 ) * grainShare ) * mix( ${f(DAY.down)}, ${f(DAY.up)}, caveN.y * 0.5 + 0.5 );
    diffuseColor.rgb = mix( diffuseColor.rgb, dayLit, vCaveDay );
  }
  if ( caveBrush.w > 0.0 ) {
    float near = 1.0 - distance( vCavePos, caveBrush.xyz ) / caveBrush.w;
    float faces = smoothstep( 0.0, 0.4, dot( normalize( vCaveNormal ), caveBrushNormal ) );
    diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * 1.7 + 0.06, 0.6 * step( 0.0, near ) * ( 0.4 + 0.6 * near ) * faces );
  }
  if ( abs( vCaveTheme - ${THEME.smooth} ) < 0.5 ) {
    vec3 toEye = normalize( cameraPosition - vCavePos );
    float glance = pow( 1.0 - max( dot( caveN, toEye ), 0.0 ), 4.0 );
    diffuseColor.rgb += vec3( 0.16, 0.18, 0.22 ) * glance;
  }
`;

// Shows a brush's patch on `material`'s rock: round continent feet `at`, out to `radius`, where
// it faces about `normal`; or none, with at null.
export function setBrush(material, at, normal, radius) {
  const { caveBrush, caveBrushNormal } = material.userData.uniforms;
  if (!at) return caveBrush.value.setW(0);
  caveBrush.value.set(...at, radius);
  caveBrushNormal.value.set(...normal);
}

export function caveMaterial() {
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, color: LIGHT });
  const [r, g, b] = new THREE.Color(FOG.color).toArray().map(f);
  material.userData.uniforms = { caveBrush: { value: new THREE.Vector4(0, 0, 0, 0) }, caveBrushNormal: { value: new THREE.Vector3(0, 1, 0) } };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, material.userData.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("void main() {", `${VERTEX}\nvoid main() {\n\tvCavePos = ( modelMatrix * vec4( position, 1.0 ) ).xyz;\n\tvCaveNormal = normal;\n\tvCaveTheme = caveTheme;\n\tvCaveDay = caveDay;`);
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", `${FRAGMENT}\nvoid main() {`)
      .replace("#include <color_fragment>", `#include <color_fragment>\n${SHADING}`)
      .replace(
        "#include <fog_fragment>",
        `#ifdef USE_FOG
  gl_FragColor.rgb = mix( gl_FragColor.rgb, vec3( ${r}, ${g}, ${b} ), smoothstep( ${f(FOG.nearFt)}, ${f(FOG.farFt)}, vFogDepth ) );
#endif`,
      );
  };
  return material;
}
