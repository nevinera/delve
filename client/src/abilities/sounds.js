import { SOUNDS } from "./stock.js";

// The stock sounds, made in the browser rather than loaded from files. A sound is a list of voices,
// each a tone or a burst of noise with its own envelope: { osc, from, to } or { noise, filter, from,
// to }, with `at` and `for` in seconds and `gain` from 0 to 1.

const RECIPES = {
  cast: [{ osc: "sine", from: 220, to: 660, for: 0.5, gain: 0.25 }, { osc: "triangle", from: 330, to: 990, for: 0.5, gain: 0.12 }],
  whoosh: [{ noise: "bandpass", from: 400, to: 1800, for: 0.4, gain: 1 }],
  impact: [{ noise: "lowpass", from: 1600, to: 200, for: 0.18, gain: 0.8 }, { osc: "sine", from: 140, to: 50, for: 0.2, gain: 0.7 }],
  fire: [{ noise: "lowpass", from: 2400, to: 500, for: 0.7, gain: 0.6 }, { osc: "sawtooth", from: 90, to: 50, for: 0.5, gain: 0.15 }],
  frost: [{ osc: "sine", from: 1800, to: 2600, for: 0.3, gain: 0.2 }, { osc: "sine", from: 2700, to: 3400, at: 0.06, for: 0.3, gain: 0.14 }, { noise: "highpass", from: 5000, to: 7000, for: 0.25, gain: 0.25 }],
  holy: [{ osc: "sine", from: 523, to: 523, for: 0.9, gain: 0.22 }, { osc: "sine", from: 659, to: 659, at: 0.08, for: 0.8, gain: 0.18 }, { osc: "sine", from: 784, to: 784, at: 0.16, for: 0.7, gain: 0.16 }],
  shadow: [{ osc: "sawtooth", from: 110, to: 55, for: 0.7, gain: 0.3 }, { noise: "lowpass", from: 500, to: 150, for: 0.7, gain: 0.45 }],
  nature: [{ osc: "triangle", from: 392, to: 523, for: 0.35, gain: 0.25 }, { noise: "bandpass", from: 1400, to: 900, for: 0.5, gain: 0.6 }],
  arcane: [{ osc: "square", from: 880, to: 1320, for: 0.3, gain: 0.08 }, { osc: "sine", from: 440, to: 220, for: 0.5, gain: 0.25 }],
  slash: [{ noise: "highpass", from: 1500, to: 4000, for: 0.14, gain: 0.7 }],
  heal: [{ osc: "sine", from: 440, to: 880, for: 0.7, gain: 0.25 }, { osc: "triangle", from: 660, to: 1320, at: 0.1, for: 0.6, gain: 0.12 }],
  shout: [{ osc: "sawtooth", from: 180, to: 130, for: 0.6, gain: 0.3 }, { osc: "square", from: 270, to: 195, for: 0.6, gain: 0.12 }],
};

export const soundVoices = (name) => RECIPES[name] ?? [];
export const missingSounds = () => SOUNDS.filter((name) => !RECIPES[name]);

const noiseBuffers = new WeakMap();
function noiseOf(context) {
  if (!noiseBuffers.has(context)) {
    const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(context, buffer);
  }
  return noiseBuffers.get(context);
}

// Plays a stock sound on `context` at its time `when`.
export function playSound(context, name, { volume = 1, pitch = 1, when = context.currentTime } = {}) {
  for (const voice of soundVoices(name)) {
    const start = when + (voice.at ?? 0);
    const stop = start + voice.for / pitch;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(voice.gain * volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, stop);
    gain.connect(context.destination);
    let source;
    let sweep;
    if (voice.osc) {
      source = context.createOscillator();
      source.type = voice.osc;
      sweep = source.frequency;
      source.connect(gain);
    } else {
      source = context.createBufferSource();
      source.buffer = noiseOf(context);
      source.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = voice.noise;
      sweep = filter.frequency;
      source.connect(filter);
      filter.connect(gain);
    }
    sweep.setValueAtTime(voice.from * pitch, start);
    sweep.exponentialRampToValueAtTime(voice.to * pitch, stop);
    source.start(start);
    source.stop(stop);
  }
}

// How long a stock sound lasts, in seconds at normal pitch.
export const soundLength = (name) => Math.max(0, ...soundVoices(name).map((v) => (v.at ?? 0) + v.for));
