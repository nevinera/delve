import * as THREE from "three";
import stock from "./stockSounds.json";

// The stock sounds: a few recordings of each, in public/sounds (script/bake_sounds.py makes them).
// SoundMixer plays them through one context, each from a place in the scene if it's given one, and
// no more than so many at once.

export const STOCK_SOUNDS = stock;
// Sounds the game plays by itself, beside the stock ones, from recordings rather than the bake:
// footstep is one soft step on sand (ATTRIBUTIONS.md), filtered and cut into six, and level-up is one
// celesta note.
const RECORDED = {
  footstep: { kind: "footstep", variations: 6, from: "freesound" },
  "level-up": { kind: "ui", variations: 1, from: "freesound" },
};
const SOUNDS = { ...stock, ...RECORDED };
// The stock sounds, what abilities and hits play, all come out at this share of their volume.
const STOCK_GAIN = 0.5;
export const soundUrl = (name, n) => `/sounds/${name}-${n}.mp3`;

const HEARD_AT_FULL_FT = 12; // nearer than this, it's as loud as it gets
const HEARD_UNTIL = 0.04; // it isn't played if distance leaves less than this of its volume
const MINE = 10; // what your own adds to how much it matters, which puts it over anyone else's
export const DESKTOP_SOUNDS = 24;
export const PHONE_SOUNDS = 12;

// How much of a sound's volume is left this far off, as the panner works it out.
export const heardAt = (feet) => HEARD_AT_FULL_FT / (HEARD_AT_FULL_FT + Math.max(0, feet - HEARD_AT_FULL_FT));

const fetched = new Map(); // url -> the bytes on their way

function bytesOf(url) {
  if (!fetched.has(url)) fetched.set(url, fetch(url).then((response) => response.arrayBuffer()));
  return fetched.get(url);
}

// Starts every stock sound on its way, so the first use of each one plays.
export function fetchSounds() {
  if (typeof fetch !== "function" || typeof AudioContext !== "function") return;
  for (const [name, { variations }] of Object.entries(SOUNDS)) {
    for (let n = 1; n <= variations; n++) bytesOf(soundUrl(name, n)).catch((err) => console.warn(`Couldn't load ${name}: ${err.message}`));
  }
}

export class SoundMixer {
  // bytes(name, n): gives a recording's bytes, for tests to replace.
  constructor(context, { limit = DESKTOP_SOUNDS, bytes = (name, n) => bytesOf(soundUrl(name, n)), rand = Math.random } = {}) {
    Object.assign(this, { context, limit, bytes, rand });
    this.buffers = new Map(); // name -> its decoded variations, which fill in as they arrive
    this.last = new Map(); // name -> the variation it played last
    this.playing = [];
    this.heardFrom = [0, 0, 0];
    // It squashes what's loudest, so that what's left of a big fight doesn't clip.
    this.out = context.createDynamicsCompressor();
    this.out.connect(context.destination);
    for (const name of Object.keys(SOUNDS)) this.load(name);
  }

  load(name) {
    const loaded = [];
    this.buffers.set(name, loaded);
    for (let n = 1; n <= SOUNDS[name].variations; n++) {
      Promise.resolve(this.bytes(name, n))
        // Decoding uses up what it's given, and other mixers can want the same bytes.
        .then((bytes) => this.context.decodeAudioData(bytes.slice(0)))
        .then((buffer) => loaded.push(buffer))
        .catch((err) => console.warn(`Couldn't decode ${name}: ${err.message}`));
    }
  }

  // A variation, never the one it played last while there's another.
  pick(name) {
    const loaded = this.buffers.get(name) ?? [];
    if (!loaded.length) return null;
    let n = Math.floor(this.rand() * loaded.length);
    if (loaded.length > 1 && n === this.last.get(name)) n = (n + 1) % loaded.length;
    this.last.set(name, n);
    return loaded[n];
  }

  // Puts your ears at `at` ([x, y, z], where your character is), or else where the camera is,
  // facing the way the camera looks, so how loud things are goes by how far they are from you.
  hear(camera, at = null) {
    const { listener } = this.context;
    const [x, y, z] = at ?? camera.position.toArray();
    this.heardFrom = [x, y, z];
    const [fx, fy, fz] = camera.getWorldDirection(new THREE.Vector3()).toArray();
    const { x: ux, y: uy, z: uz } = camera.up;
    if (listener.positionX) {
      const now = this.context.currentTime;
      [[listener.positionX, x], [listener.positionY, y], [listener.positionZ, z], [listener.forwardX, fx], [listener.forwardY, fy], [listener.forwardZ, fz], [listener.upX, ux], [listener.upY, uy], [listener.upZ, uz]].forEach(([param, value]) => param.setValueAtTime(value, now));
    } else {
      listener.setPosition?.(x, y, z);
      listener.setOrientation?.(fx, fy, fz, ux, uy, uz);
    }
  }

  // How much of a sound you'd hear from here.
  loudness(volume, at) {
    const off = at ? Math.hypot(at[0] - this.heardFrom[0], at[1] - this.heardFrom[1], at[2] - this.heardFrom[2]) : 0;
    return volume * heardAt(off);
  }

  // Plays a stock sound, and gives back what's playing, or null if it didn't.
  // options: volume; pitch; pitchVariation, how far off it can land each time, as a share of pitch;
  // delay, in seconds; at, [x, y, z] in the scene, or none for one that's only heard, like a menu's;
  // and mine, for your own, which are the last to go.
  play(name, { volume = 1, pitch = 1, pitchVariation = 0, delay = 0, at = null, mine = false } = {}) {
    // Browsers hold sound back until you've pressed something, and what's played till then would
    // all come out at once.
    if (this.context.state === "suspended") return null;
    // Too far off to hear goes by what distance takes away, so a quiet sound nearby still plays.
    if (this.loudness(1, at) < HEARD_UNTIL) return null;
    const loud = this.loudness(volume, at);
    // How much it matters, for what gets dropped when too many are going.
    const worth = loud + (mine || !at ? MINE : 0);
    if (this.playing.length >= this.limit) {
      const least = this.playing.reduce((a, b) => (b.worth < a.worth ? b : a));
      if (least.worth >= worth) return null;
      this.stop(least);
    }
    const buffer = this.pick(name);
    if (!buffer) return null;
    const { context } = this;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = pitch * (1 + pitchVariation * (this.rand() * 2 - 1));
    const gain = context.createGain();
    gain.gain.value = volume * (name in stock ? STOCK_GAIN : 1);
    source.connect(gain);
    if (at) {
      const panner = context.createPanner();
      panner.panningModel = "equalpower";
      panner.distanceModel = "inverse";
      panner.refDistance = HEARD_AT_FULL_FT;
      panner.rolloffFactor = 1;
      panner.setPosition?.(...at);
      if (panner.positionX) [panner.positionX.value, panner.positionY.value, panner.positionZ.value] = at;
      gain.connect(panner);
      panner.connect(this.out);
    } else {
      gain.connect(this.out);
    }
    const voice = { name, source, gain, worth };
    source.onended = () => {
      this.playing = this.playing.filter((v) => v !== voice);
      gain.disconnect();
    };
    this.playing.push(voice);
    source.start(context.currentTime + delay);
    return voice;
  }

  stop(voice) {
    this.playing = this.playing.filter((v) => v !== voice);
    voice.source.onended = null;
    voice.source.stop();
    voice.gain.disconnect();
  }
}

