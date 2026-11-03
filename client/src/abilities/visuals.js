import * as THREE from "three";

// The stock visuals: small three.js groups made in code. makeVisual gives { group, length, update },
// and update(u) draws it u of the way through its length, 0 to 1. A `from` and `to` in feet, for
// beams, reach between two points; the rest stand where the group's put.

const basic = (color, opacity = 0.9) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

const sphere = (radius, color, opacity) => new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 12), basic(color, opacity));

// Fades everything in the group by `amount`, from the opacity each mesh started with.
function fade(group, amount) {
  group.traverse((node) => {
    if (!node.material) return;
    node.userData.opacity ??= node.material.opacity;
    node.material.opacity = node.userData.opacity * amount;
  });
}

const MAKERS = {
  // Flying things: the caller moves them, and they keep their look.
  bolt: ({ colors: [main, trim], scale }) => {
    const group = new THREE.Group();
    group.add(sphere(0.55 * scale, main, 0.7), sphere(0.3 * scale, trim, 1));
    return { group, length: 1, update: (u) => group.scale.setScalar(1 + 0.12 * Math.sin(u * 40)) };
  },
  arrow: ({ colors: [main, trim], scale }) => {
    const group = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * scale, 0.05 * scale, 2.4 * scale, 6).rotateX(Math.PI / 2), basic(main, 1));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.14 * scale, 0.4 * scale, 8).rotateX(Math.PI / 2).translate(0, 0, 1.3 * scale), basic(trim, 1));
    group.add(shaft, tip);
    return { group, length: 1, update: () => {} };
  },
  burst: ({ colors: [main, trim], scale }) => {
    const group = new THREE.Group();
    const [outer, inner] = [sphere(1, main, 0.7), sphere(0.6, trim, 0.9)];
    group.add(outer, inner);
    return {
      group,
      length: 0.45,
      update: (u) => {
        outer.scale.setScalar((0.6 + 3.2 * u) * scale);
        inner.scale.setScalar((0.5 + 2 * u) * scale);
        fade(group, 1 - u);
      },
    };
  },
  ring: ({ colors: [main, trim], scale }) => {
    const group = new THREE.Group();
    const flat = (color) => new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2), basic(color, 0.9));
    const [outer, inner] = [flat(main), flat(trim)];
    group.add(outer, inner);
    group.position.y = 0.15;
    return {
      group,
      length: 0.7,
      update: (u) => {
        outer.scale.setScalar((1 + 7 * u) * scale);
        inner.scale.setScalar((0.5 + 4 * u) * scale);
        fade(group, 1 - u);
      },
    };
  },
  glow: ({ colors: [main, trim], scale, height }) => {
    const group = new THREE.Group();
    const [outer, inner] = [sphere(0.5 * height, main, 0.35), sphere(0.32 * height, trim, 0.25)];
    group.add(outer, inner);
    group.position.y = height / 2;
    return {
      group,
      length: 0.9,
      update: (u) => {
        group.scale.setScalar(scale * (0.8 + 0.3 * Math.sin(u * Math.PI)));
        fade(group, Math.sin(u * Math.PI));
      },
    };
  },
  swirl: ({ colors: [main, trim], scale, height }) => {
    const group = new THREE.Group();
    const motes = Array.from({ length: 10 }, (_, n) => sphere(0.14 * scale, n % 2 ? main : trim, 1));
    group.add(...motes);
    return {
      group,
      length: 1.1,
      update: (u) => {
        motes.forEach((mote, n) => {
          const a = n * 0.63 + u * 11;
          const r = 1.7 * scale * (1 - u * 0.4);
          mote.position.set(Math.cos(a) * r, height * ((n / 10 + u) % 1), Math.sin(a) * r);
        });
        fade(group, Math.sin(u * Math.PI));
      },
    };
  },
  beam: ({ colors: [main, trim], scale, from, to }) => {
    const group = new THREE.Group();
    const [a, b] = [new THREE.Vector3(...(from ?? [0, 0, 0])), new THREE.Vector3(...(to ?? [0, 0, 1]))];
    const length = Math.max(0.1, a.distanceTo(b));
    const rod = (radius, color, opacity) => new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 10).rotateX(Math.PI / 2), basic(color, opacity));
    const beam = new THREE.Group();
    beam.add(rod(0.35 * scale, main, 0.55), rod(0.12 * scale, trim, 1));
    beam.position.copy(a).lerp(b, 0.5);
    beam.lookAt(b);
    group.add(beam);
    return { group, length: 0.5, update: (u) => fade(group, Math.sin(u * Math.PI)) };
  },
  slash: ({ colors: [main, trim], scale, height }) => {
    const group = new THREE.Group();
    const arc = (radius, color) => new THREE.Mesh(new THREE.RingGeometry(radius * 0.8, radius, 24, 1, -0.6, 2.2), basic(color, 1));
    const [outer, inner] = [arc(2.4 * scale, main), arc(1.9 * scale, trim)];
    group.add(outer, inner);
    group.position.y = height * 0.6;
    return {
      group,
      length: 0.28,
      update: (u) => {
        group.rotation.z = -1.2 + 2.4 * u;
        fade(group, 1 - u);
      },
    };
  },
  cone: ({ colors: [main, trim], scale, height }) => {
    const group = new THREE.Group();
    const shape = (radius, color, opacity) => new THREE.Mesh(new THREE.ConeGeometry(radius, 12 * scale, 16, 1, true).translate(0, -6 * scale, 0).rotateX(-Math.PI / 2), basic(color, opacity));
    group.add(shape(3 * scale, main, 0.5), shape(1.4 * scale, trim, 0.7));
    group.position.y = height * 0.65;
    return {
      group,
      length: 0.55,
      update: (u) => {
        group.scale.setScalar(0.4 + 0.6 * Math.min(1, u * 3));
        fade(group, 1 - u * u);
      },
    };
  },
  shield: ({ colors: [main, trim], scale, height }) => {
    const group = new THREE.Group();
    const [outer, wire] = [sphere(0.62 * height, main, 0.22), new THREE.Mesh(new THREE.IcosahedronGeometry(0.64 * height, 1), new THREE.MeshBasicMaterial({ color: trim, wireframe: true, transparent: true, opacity: 0.5 }))];
    group.add(outer, wire);
    group.position.y = height / 2;
    group.scale.setScalar(scale);
    return {
      group,
      length: 1.2,
      update: (u) => {
        wire.rotation.y = u * 2;
        fade(group, Math.min(1, u * 5, (1 - u) * 3));
      },
    };
  },
};

export const hasVisual = (name) => Boolean(MAKERS[name]);

// A stock visual. options: colors, [main, trim]; scale; height, of what it stands on, in feet; and
// from and to for a beam, as [x, y, z].
export function makeVisual(name, { colors = ["#ffffff", "#ffffff"], scale = 1, height = 6, from, to } = {}) {
  const made = (MAKERS[name] ?? MAKERS.burst)({ colors, scale, height, from, to });
  made.update(0);
  return made;
}

export function disposeVisual({ group }) {
  group.parent?.remove(group);
  group.traverse((node) => {
    node.geometry?.dispose();
    node.material?.dispose();
  });
}
