#!/usr/bin/env python3
"""Builds the stock sounds in public/sounds, and their list in client/src/abilities/stockSounds.json.

Each stock sound has a few variations. Some come from Kenney's CC0 packs, and the rest this script
synthesizes, so they're ours. Every one comes out as mono MP3 with its leading silence cut, at about
the same loudness.

    script/bake_sounds.py <folder holding Kenney's packs> [--alternates <folder>]

The packs go in folders named impact-sounds, rpg-audio and sci-fi-sounds. With
--alternates it also writes the sounds in ALTERNATES there, to compare against the stock ones.
"""
import json
import math
import os
import random
import re
import subprocess
import sys
import tempfile
import wave

RATE = 44100
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "public", "sounds")
LIST = os.path.join(ROOT, "client", "src", "abilities", "stockSounds.json")

# The loudness everything's brought to, in dB, and the highest it can peak.
MEAN_DB = -18
PEAK_DB = -2


def samples(seconds):
    return int(seconds * RATE)


def blank(seconds):
    return [0.0] * samples(seconds)


def add(into, voice, at=0.0, gain=1.0):
    start = samples(at)
    for n, v in enumerate(voice):
        if start + n >= len(into):
            break
        into[start + n] += v * gain
    return into


def decay(seconds, attack=0.004, power=3.0):
    """A quick rise, then a fall that reaches silence at the end."""
    n = samples(seconds)
    rise = max(1, samples(attack))
    return [min(1, i / rise) * (1 - i / n) ** power for i in range(n)]


def bell(seconds, peak=0.4):
    """A swell that rises to its peak, a share of the way through, and falls away."""
    n = samples(seconds)
    top = max(1, int(n * peak))
    return [math.sin((i / top) * math.pi / 2) if i < top else math.cos(((i - top) / max(1, n - top)) * math.pi / 2) for i in range(n)]


def times(a, b):
    return [x * y for x, y in zip(a, b)]


def noise(seconds, rng):
    return [rng.uniform(-1, 1) for _ in range(samples(seconds))]


def tone(seconds, start, end=None, shape="sine", vibrato=0.0, rate=6.0):
    """A tone gliding from one pitch to another."""
    end = end or start
    n = samples(seconds)
    phase = 0.0
    out = []
    for i in range(n):
        f = start * (end / start) ** (i / n)
        if vibrato:
            f *= 1 + vibrato * math.sin(math.tau * rate * i / RATE)
        phase = (phase + f / RATE) % 1
        if shape == "sine":
            out.append(math.sin(math.tau * phase))
        elif shape == "saw":
            out.append(2 * phase - 1)
        elif shape == "square":
            out.append(1 if phase < 0.5 else -1)
        else:
            out.append(4 * abs(phase - 0.5) - 1)
    return out


def filtered(signal, cutoff, kind="low", q=1.0):
    """A filter whose cutoff, a number or fn(0 to 1), can move as it goes."""
    low = band = 0.0
    damp = 1 / max(0.5, q)
    n = max(1, len(signal))
    out = []
    for i, x in enumerate(signal):
        fc = cutoff(i / n) if callable(cutoff) else cutoff
        f = 2 * math.sin(math.pi * min(fc, RATE / 6.5) / RATE)
        low += f * band
        high = x - low - damp * band
        band += f * high
        out.append({"low": low, "high": high, "band": band}[kind])
    return out


def glide(*points):
    """A cutoff moving through (where, value) points, each `where` from 0 to 1, evenly in pitch."""
    def at(u):
        for (a, x), (b, y) in zip(points, points[1:]):
            if u <= b:
                return x * (y / x) ** ((u - a) / max(1e-6, b - a))
        return points[-1][1]
    return at


def pluck(seconds, pitch, rng, damp=0.5):
    """A string plucked: noise going round a short delay."""
    size = max(2, int(RATE / pitch))
    ring = [rng.uniform(-1, 1) for _ in range(size)]
    out = []
    for i in range(samples(seconds)):
        k = i % size
        out.append(ring[k])
        ring[k] = (ring[k] + ring[(k + 1) % size]) * 0.5 * (1 - 0.01 * damp)
    return out


def ping(seconds, pitch, power=4.0):
    return times(tone(seconds, pitch), decay(seconds, power=power))


def metal(seconds, base, rng, ratios=(1, 1.48, 2.14, 3.33, 4.71), power=5.0):
    out = blank(seconds)
    for k, ratio in enumerate(ratios):
        add(out, ping(seconds * (1 - k * 0.1), base * ratio * rng.uniform(0.98, 1.02), power), gain=1 / (k + 1))
    return out


# The sounds this script makes. Each takes a random generator, so its variations differ.

def whoosh(rng, seconds=None, top=None):
    seconds = seconds or rng.uniform(0.28, 0.38)
    top = top or rng.uniform(1700, 2600)
    return times(filtered(noise(seconds, rng), glide((0, 350), (0.45, top), (1, 450)), "band", 2.0), bell(seconds, rng.uniform(0.35, 0.5)))


def miss(rng):
    return whoosh(rng, rng.uniform(0.16, 0.22), rng.uniform(2600, 3400))


def slash(rng):
    out = blank(0.34)
    add(out, whoosh(rng, 0.2, rng.uniform(3000, 4200)), gain=1.0)
    add(out, metal(0.28, rng.uniform(2400, 3200), rng, power=7), at=0.07, gain=0.22)
    return out


def cast(rng):
    seconds = 0.6
    base = rng.uniform(210, 270)
    out = blank(seconds)
    add(out, times(tone(seconds, base, base * 3, vibrato=0.012), bell(seconds, 0.75)), gain=0.5)
    add(out, times(tone(seconds, base * 1.5, base * 4.5, "triangle", vibrato=0.012), bell(seconds, 0.8)), gain=0.25)
    add(out, times(filtered(noise(seconds, rng), glide((0, 900), (1, 5000)), "band", 2.0), bell(seconds, 0.8)), gain=0.5)
    return out


def sparkles(seconds, count, low, high, rng, each=0.25):
    out = blank(seconds)
    for k in range(count):
        at = (k / count) * (seconds - each) * rng.uniform(0.9, 1.1)
        add(out, ping(each, rng.uniform(low, high), 5), at=max(0, at), gain=rng.uniform(0.2, 0.45))
    return out


def shimmer(rng):
    return sparkles(0.9, 26, 1800, 6500, rng)


def fire(rng):
    seconds = 0.85
    roar = filtered(noise(seconds, rng), glide((0, 2600), (0.3, 1100), (1, 350)), "low", 1.2)
    slow = filtered(noise(seconds, rng), 14, "low", 0.8)
    top = max(abs(v) for v in slow) or 1
    out = [r * (0.55 + 0.45 * s / top) * e for r, s, e in zip(roar, slow, decay(seconds, 0.03, 1.4))]
    for _ in range(14):
        crack = times(filtered(noise(0.02, rng), rng.uniform(1800, 5000), "band", 3), decay(0.02, 0.001, 2))
        add(out, crack, at=rng.uniform(0, seconds - 0.05), gain=rng.uniform(0.6, 1.4))
    return out


def frost(rng):
    seconds = 0.75
    out = blank(seconds)
    add(out, times(filtered(noise(0.05, rng), 4500, "high"), decay(0.05, 0.001, 3)), gain=0.8)
    add(out, sparkles(seconds, 16, 2600, 7800, rng, 0.2), gain=1.0)
    add(out, times(filtered(noise(seconds, rng), glide((0, 7000), (1, 3000)), "high"), decay(seconds, 0.01, 2)), gain=0.14)
    return out


def chord(seconds, pitches, rng, attack=0.02, power=2.0, spread=0.05):
    out = blank(seconds)
    for k, pitch in enumerate(pitches):
        wave_ = [a + 0.3 * b for a, b in zip(tone(seconds, pitch * rng.uniform(0.998, 1.002)), tone(seconds, pitch * 2.003))]
        add(out, times(wave_, decay(seconds - k * spread, attack, power)), at=k * spread, gain=1 / (1 + k * 0.25))
    return out


def holy(rng):
    root = rng.choice([523.25, 587.33, 493.88])
    out = chord(1.1, [root, root * 1.26, root * 1.5, root * 2], rng, 0.03)
    return add(out, sparkles(1.1, 12, 3000, 6500, rng, 0.25), gain=0.25)


def shadow(rng):
    seconds = 0.95
    low = rng.uniform(52, 66)
    voice = [a + b for a, b in zip(tone(seconds, low, low * 0.8, "saw"), tone(seconds, low * 1.01, low * 0.82, "saw"))]
    out = times(filtered(voice, glide((0, 200), (0.6, 800), (1, 150)), "low", 1.5), bell(seconds, 0.55))
    swell = [v * (i / samples(seconds)) ** 3 for i, v in enumerate(filtered(noise(seconds, rng), glide((0, 300), (1, 1500)), "band", 1.5))]
    return add(out, swell, gain=0.6)


def nature(rng):
    seconds = 0.75
    out = blank(seconds)
    for _ in range(9):
        length = rng.uniform(0.05, 0.12)
        add(out, times(filtered(noise(length, rng), rng.uniform(2500, 5500), "band", 1.5), bell(length)), at=rng.uniform(0, seconds - length), gain=rng.uniform(0.3, 0.7))
    for k, pitch in enumerate(rng.sample([294, 330, 392, 440, 494], 3)):
        add(out, times(pluck(0.4, pitch, rng), decay(0.4, 0.001, 2)), at=k * 0.11, gain=0.55)
    return out


def arcane(rng):
    seconds = 0.8
    base = rng.uniform(330, 470)
    out = []
    phase = 0.0
    for i in range(samples(seconds)):
        u = i / samples(seconds)
        mod = math.sin(math.tau * base * 2.76 * i / RATE) * (3.5 * (1 - u))
        f = base * (1 + 0.35 * math.sin(math.tau * 5 * u))
        phase = (phase + f / RATE) % 1
        out.append(math.sin(math.tau * phase + mod))
    return add(times(out, decay(seconds, 0.015, 1.6)), sparkles(seconds, 10, 2500, 5000, rng, 0.15), gain=0.25)


def heal(rng):
    root = rng.choice([392.0, 440.0, 349.23])
    out = blank(1.1)
    for k, ratio in enumerate([1, 1.25, 1.5, 2, 2.5]):
        voice = [a + 0.2 * b for a, b in zip(tone(0.75, root * ratio), tone(0.75, root * ratio * 3))]
        add(out, times(voice, decay(0.75, 0.012, 3)), at=k * 0.075, gain=0.7)
    return out


def lightning(rng):
    seconds = 0.6
    out = blank(seconds)
    for _ in range(7):
        length = rng.uniform(0.01, 0.05)
        add(out, times(filtered(noise(length, rng), 2200, "high"), decay(length, 0.001, 1)), at=rng.uniform(0, 0.16), gain=rng.uniform(0.6, 1.2))
    add(out, times(filtered(noise(seconds, rng), glide((0, 1800), (1, 90)), "low"), decay(seconds, 0.002, 3)), gain=1.1)
    return add(out, times(tone(0.4, 90, 38), decay(0.4, 0.003, 2)), gain=0.7)


def explosion(rng):
    seconds = 1.0
    out = times(filtered(noise(seconds, rng), glide((0, 4200), (0.2, 900), (1, 80)), "low", 1.0), decay(seconds, 0.002, 2.4))
    add(out, times(tone(0.6, 95, 30), decay(0.6, 0.002, 2)), gain=0.9)
    return out


def bowshot(rng):
    out = blank(0.4)
    add(out, times(pluck(0.14, rng.uniform(150, 210), rng), decay(0.14, 0.001, 2)), gain=0.9)
    add(out, whoosh(rng, 0.26, rng.uniform(2800, 3800)), at=0.02, gain=0.5)
    return out


def voiced(seconds, start, end, formants, rng, rough=0.0, tremolo=0.0):
    """A throat: a buzz through a mouth shape. It's not much like a real voice."""
    buzz = tone(seconds, start, end, "saw", vibrato=0.015, rate=rng.uniform(5, 7))
    if rough:
        buzz = [b + rough * v for b, v in zip(buzz, noise(seconds, rng))]
    out = blank(seconds)
    for k, (freq, q) in enumerate(formants):
        add(out, filtered(buzz, freq, "band", q), gain=1 / (k + 1))
    if tremolo:
        out = [v * (0.65 + 0.35 * math.sin(math.tau * tremolo * i / RATE)) for i, v in enumerate(out)]
    return out


def shout(rng):
    seconds = rng.uniform(0.45, 0.6)
    start = rng.uniform(170, 210)
    voice = voiced(seconds, start, start * 0.72, [(760, 4), (1250, 5), (2600, 6)], rng, rough=0.12)
    return times(voice, bell(seconds, 0.2))


def growl(rng):
    seconds = rng.uniform(0.7, 0.95)
    low = rng.uniform(68, 88)
    voice = voiced(seconds, low, low * 0.85, [(480, 3), (950, 4)], rng, rough=0.4, tremolo=rng.uniform(22, 30))
    return times(voice, bell(seconds, 0.3))


def mob_hurt(rng):
    seconds = rng.uniform(0.2, 0.3)
    start = rng.uniform(190, 260)
    return times(voiced(seconds, start, start * 0.55, [(620, 3), (1100, 4)], rng, rough=0.3), decay(seconds, 0.006, 1.5))


def mob_death(rng):
    seconds = rng.uniform(0.85, 1.05)
    start = rng.uniform(140, 175)
    voice = voiced(seconds, start, start * 0.33, [(glide((0, 700), (1, 240)), 3), (glide((0, 1200), (1, 500)), 4)], rng, rough=0.35, tremolo=9)
    return times(voice, decay(seconds, 0.01, 1.3))


def thud(seconds, pitch, rng):
    out = times(tone(seconds, pitch, pitch * 0.45), decay(seconds, 0.002, 3))
    return add(out, times(filtered(noise(seconds, rng), 500, "low"), decay(seconds, 0.001, 4)), gain=0.7)


def death(rng):
    out = blank(0.75)
    add(out, whoosh(rng, 0.25, 700), gain=0.2)
    add(out, thud(0.28, rng.uniform(85, 105), rng), at=0.16, gain=1.0)
    add(out, thud(0.22, rng.uniform(110, 135), rng), at=0.36, gain=0.65)
    return add(out, times(filtered(noise(0.3, rng), 1800, "band", 1), bell(0.3)), at=0.36, gain=0.12)



def block(rng):
    out = metal(0.4, rng.uniform(640, 820), rng, power=6)
    return add(out, thud(0.14, 130, rng), gain=0.7)


def energy_impact(rng):
    out = thud(0.22, rng.uniform(120, 150), rng)
    return add(out, times(filtered(noise(0.18, rng), glide((0, 1800), (1, 250)), "low"), decay(0.18, 0.001, 2)), gain=0.8)


def made(fn, count=3):
    return [("made", fn, n) for n in range(count)]


def pack(pack_name, stem, picks):
    return [("pack", f"{pack_name}/Audio/{stem}{suffix}.ogg") for suffix in picks]


def rpg(stem, picks):
    return [("pack", f"rpg-audio/Audio/{stem}{suffix}.ogg") for suffix in picks]


FOUR = ["_000", "_001", "_002", "_003"]
THREE = FOUR[:3]

# name -> (what it's for, its variations). The first sets are what abilities pick from.
STOCK = {
    "cast": ("ability", made(cast)),
    "whoosh": ("ability", made(whoosh, 4)),
    "slash": ("ability", made(slash, 4)),
    "bowshot": ("ability", made(bowshot)),
    "fire": ("ability", made(fire)),
    "frost": ("ability", made(frost)),
    "holy": ("ability", made(holy)),
    "shadow": ("ability", made(shadow)),
    "nature": ("ability", made(nature)),
    "arcane": ("ability", made(arcane)),
    "lightning": ("ability", made(lightning)),
    "explosion": ("ability", made(explosion)),
    "heal": ("ability", made(heal)),
    "shimmer": ("ability", made(shimmer)),
    "shout": ("ability", made(shout)),
    "impact": ("hit", pack("impact-sounds", "impactPunch_heavy", FOUR)),
    "hit-metal": ("hit", pack("impact-sounds", "impactPlate_medium", FOUR)),
    "hit-soft": ("hit", pack("impact-sounds", "impactSoft_medium", FOUR)),
    "block": ("hit", pack("impact-sounds", "impactMetal_heavy", FOUR)),
    "miss": ("hit", made(miss, 3)),
    "growl": ("mob", made(growl)),
    "mob-hurt": ("mob", made(mob_hurt, 4)),
    "mob-death": ("mob", made(mob_death)),
    "death": ("mob", made(death)),
    "step-grass": ("footstep", pack("impact-sounds", "footstep_grass", FOUR)),
    "step-stone": ("footstep", pack("impact-sounds", "footstep_concrete", FOUR)),
    "step-wood": ("footstep", pack("impact-sounds", "footstep_wood", FOUR)),
    "step-snow": ("footstep", pack("impact-sounds", "footstep_snow", FOUR)),
    "coins": ("loot", rpg("handleCoins", ["", "2"])),
    "loot-cloth": ("loot", rpg("cloth", ["1", "2", "3"])),
}

# Other takes on some of them, to compare by ear. These don't go in the game.
ALTERNATES = {
    "slash": rpg("knifeSlice", ["", "2"]) + rpg("drawKnife", ["1", "2"]),
    "impact": made(energy_impact, 2) + pack("impact-sounds", "impactPunch_medium", THREE),
    "hit-metal": pack("impact-sounds", "impactMetal_medium", THREE),
    "block": made(block, 3) + pack("impact-sounds", "impactPlate_heavy", THREE),
    "frost": pack("impact-sounds", "impactGlass_light", THREE),
    "explosion": pack("sci-fi-sounds", "explosionCrunch", THREE) + pack("sci-fi-sounds", "lowFrequency_explosion", ["_000", "_001"]),
    "fire": pack("sci-fi-sounds", "thrusterFire", THREE),
    "shimmer": pack("sci-fi-sounds", "forceField", THREE),
    "nature": pack("sci-fi-sounds", "slime", ["_000", "_001"]),
    "lightning": pack("sci-fi-sounds", "laserLarge", THREE),
    "loot-cloth": rpg("dropLeather", [""]) + rpg("handleSmallLeather", ["", "2"]),
    "step-stone": pack("impact-sounds", "footstep_carpet", ["_000", "_001"]),
}


def write_wave(path, signal):
    top = max((abs(v) for v in signal), default=1) or 1
    with wave.open(path, "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(RATE)
        out.writeframes(b"".join(int(v / top * 32000).to_bytes(2, "little", signed=True) for v in signal))


def ffmpeg(*args):
    return subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-y", *args], capture_output=True, text=True, check=True).stderr


TRIM = "silenceremove=start_periods=1:start_threshold=-50dB"


def encode(source, target):
    """Writes it as an MP3 at the loudness everything shares, and says what it came to."""
    levels = ffmpeg("-i", source, "-af", f"{TRIM},volumedetect", "-f", "null", "-")
    mean = float(re.search(r"mean_volume: (-?[\d.]+)", levels).group(1))
    peak = float(re.search(r"max_volume: (-?[\d.]+)", levels).group(1))
    gain = min(MEAN_DB - mean, PEAK_DB - peak)
    ffmpeg("-i", source, "-ac", "1", "-ar", "44100", "-af", f"{TRIM},volume={gain:.2f}dB,areverse,afade=t=in:d=0.01,areverse", "-codec:a", "libmp3lame", "-q:a", "5", target)
    length = float(re.search(r"Duration: (\d+):(\d+):([\d.]+)", ffmpeg("-i", target, "-f", "null", "-")).group(3))
    return round(length, 3), round(peak + gain, 1), round(mean + gain, 1)


def bake(take, name, n, packs, target, temp):
    if take[0] == "pack":
        source = os.path.join(packs, take[1])
    else:
        source = os.path.join(temp, "made.wav")
        write_wave(source, take[1](random.Random(f"{name}-{take[2]}")))
    return encode(source, target)


def main():
    args = sys.argv[1:]
    alternates = None
    if "--alternates" in args:
        at = args.index("--alternates")
        alternates = args[at + 1]
        del args[at:at + 2]
    packs = args[0]
    os.makedirs(OUT, exist_ok=True)
    listed = {}
    with tempfile.TemporaryDirectory() as temp:
        for name, (kind, takes) in STOCK.items():
            for n, take in enumerate(takes, 1):
                print(name, n, *bake(take, name, n, packs, os.path.join(OUT, f"{name}-{n}.mp3"), temp))
            listed[name] = {"kind": kind, "variations": len(takes), "from": sorted({"kenney" if t[0] == "pack" else "made" for t in takes})[0]}
        if alternates:
            os.makedirs(alternates, exist_ok=True)
            for name, takes in ALTERNATES.items():
                for n, take in enumerate(takes, 1):
                    label = take[1].split("/")[-1].removesuffix(".ogg") if take[0] == "pack" else take[1].__name__
                    print("alt", name, label, *bake(take, f"alt-{name}", n, packs, os.path.join(alternates, f"{name}--{n}--{label}.mp3"), temp))
    with open(LIST, "w") as out:
        json.dump(listed, out, indent=2)
        out.write("\n")
    # Names each file by what's in it, so browsers fetch the ones that changed.
    subprocess.run(["node", os.path.join(ROOT, "script", "hash_sounds.mjs")], check=True)


if __name__ == "__main__":
    main()
