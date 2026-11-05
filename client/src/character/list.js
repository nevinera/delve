import "../errors/install.js";
import * as THREE from "three";
import { characterClips, loadAnimations } from "./animations.js";
import { characterMesh, disposeCharacter } from "./characterMesh.js";
import { resolveRecipe } from "./recipe.js";

// Your characters' list: a picture of each character, standing at ease, in each canvas with a
// data-look. One renderer draws them all in turn and each is copied onto its own canvas. Every
// picture is framed the same, so taller characters stand taller.

const POSE_S = 0.6; // how far into the idle clip each stands
const FRAME_FT = 8.2; // the height each picture shows, ground to top

let renderer = null;
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xdde8ff, 0x445533, 1.1));
const sun = new THREE.DirectionalLight(0xfff6e8, 1.6);
sun.position.set(-0.45, 1.15, 0.85);
scene.add(sun);
const camera = new THREE.PerspectiveCamera(22, 1, 0.1, 100);

async function draw() {
  const canvases = [...document.querySelectorAll("canvas[data-look]:not([data-drawn])")];
  if (!canvases.length) return;
  renderer ??= new THREE.WebGLRenderer({ antialias: true, alpha: true });
  const baked = await loadAnimations();
  for (const canvas of canvases) {
    canvas.dataset.drawn = "";
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const [w, h] = [canvas.clientWidth * dpr, canvas.clientHeight * dpr];
    canvas.width = w;
    canvas.height = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const distance = FRAME_FT / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.position.set(distance * 0.3, FRAME_FT / 2 + 0.6, distance);
    camera.lookAt(0, FRAME_FT / 2, 0);
    camera.updateProjectionMatrix();

    const character = characterMesh(resolveRecipe(JSON.parse(canvas.dataset.look)));
    character.rotation.y = 0.35;
    scene.add(character);
    const mixer = new THREE.AnimationMixer(character);
    mixer.clipAction(characterClips(character, baked).get("Idle_Loop")).play();
    mixer.update(POSE_S);
    renderer.render(scene, camera);
    canvas.getContext("2d").drawImage(renderer.domElement, 0, 0);
    scene.remove(character);
    disposeCharacter(character);
  }
}

// Turbo swaps pages in without running this again.
document.addEventListener("turbo:load", draw);
draw();
