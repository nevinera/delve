import * as THREE from "three";

// Clips split at the waist, so a humanoid can swing or cast with its arms while its legs run.

const UPPER_BONE = /^(spine|neck|head|clavicle|upperarm|lowerarm|hand)/;
const FADE_S = 0.1;

export const canSplit = (model) => model.userData.skeleton === "humanoid";

// A clip's upper or lower half, by the name it's kept under in `clips`.
export function halfOf(clips, name, half) {
  const key = `${name}@${half}`;
  if (!clips.has(key)) {
    const whole = clips.get(name);
    const tracks = whole.tracks.filter((track) => UPPER_BONE.test(track.name) === (half === "upper"));
    const clip = new THREE.AnimationClip(key, whole.duration, tracks);
    clip.userData = whole.userData;
    clips.set(key, clip);
  }
  return key;
}

// What a body's arms are doing over its legs. Whatever plays the legs plays their lower half.
export class UpperBody {
  constructor(mixer, clips) {
    Object.assign(this, { mixer, clips, showing: null, action: null });
  }

  // Plays a clip on the arms from `time` seconds in. `showing` says which go this is: the same one
  // carries on, and another starts over.
  show(showing, name, { time = 0, once = true, speed = 1 } = {}) {
    if (this.showing === showing) return;
    this.clear();
    this.showing = showing;
    const clip = this.clips.get(halfOf(this.clips, name, "upper"));
    this.action = this.mixer.clipAction(clip);
    this.action.reset();
    this.action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    this.action.clampWhenFinished = once;
    this.action.time = time;
    this.action.timeScale = speed;
    this.action.fadeIn(FADE_S).play();
  }

  clear() {
    this.action?.fadeOut(FADE_S);
    this.action = null;
    this.showing = null;
  }
}
