import { SCHOOL_COLORS, SOUNDS, VISUALS } from "../abilities/stock.js";
import { setKey } from "./form.js";

// The choices for how an ability looks and sounds, and what picking each does to it. Nothing here
// draws. Strips are as choiceStrip.js has them.

const options = (pairs) => pairs.map(([value, label]) => ({ value, label }));

export const isMelee = (ability) => ability.range === "melee";

const MOTIONS = { attack: "Swing", bigAttack: "Big swing", stab: "Stab", punch: "Punch", kick: "Kick", shieldBash: "Shield bash", groundSlam: "Ground slam", spinningAttack: "Spin", offhandAttack: "Off-hand swing", dualAttack: "Two-handed swing", spinningKick: "Spinning kick", cast: "Cast", castBig: "Big cast", castOverhead: "Overhead", castGround: "At the ground", castSelf: "On yourself", castOnAlly: "On an ally", castChannel: "Channel", pray: "Pray", shoot: "Shoot", aimedShot: "Aimed shot", rapidShot: "Rapid shot", throw: "Throw", shout: "Shout", breath: "Breath", roll: "Roll", drink: "Drink", transform: "Transform", none: "Stand still" };
const FIRST_MOTIONS = {
  melee: ["attack", "bigAttack", "stab", "punch", "kick", "shieldBash", "groundSlam"],
  other: ["cast", "castBig", "castOverhead", "castGround", "castSelf", "castOnAlly", "shoot", "throw"],
};

export function motionStrip(ability) {
  const first = FIRST_MOTIONS[isMelee(ability) ? "melee" : "other"];
  const option = (value) => ({ value, label: MOTIONS[value] ?? value });
  return {
    name: "how the body moves",
    options: [{ value: "", label: "The usual move" }, ...first.map(option)],
    more: Object.keys(MOTIONS).filter((value) => !first.includes(value)).map(option),
    owner: ability,
    value: ability.animation ?? "",
    pick: (v) => setKey(ability, "animation", v),
  };
}

// How a melee swing feels, as sets of its numbers. "" leaves them to the swing's own.
const WEIGHTS = {
  "": { clipSpeed: undefined, lunge: undefined, pause: undefined, shake: undefined },
  quick: { clipSpeed: 1.25, lunge: 0.3, pause: 0.02, shake: undefined },
  weighty: { clipSpeed: 0.85, lunge: 1, pause: 0.1, shake: 0.15 },
};

export function weightStrip(ability) {
  const swings = isMelee(ability) && [undefined, "attack", "bigAttack"].includes(ability.animation);
  if (!swings) return null;
  const value = Object.keys(WEIGHTS).find((name) => Object.entries(WEIGHTS[name]).every(([key, held]) => ability[key] === held));
  return {
    name: "how a swing feels",
    options: options([["quick", "Quick"], ["", "Even"], ["weighty", "Weighty"]]),
    value,
    pick: (v) => Object.entries(WEIGHTS[v]).forEach(([key, held]) => setKey(ability, key, held)),
  };
}

// The moments an ability has that something can happen at.
const HELD = ["glow", "swirl", "motes", "embers", "flames", "smoke", "shield", "beam", "decal"];
const PROJECTILES = ["bolt", "arrow"];
const FIRST_VISUALS = {
  cast: ["glow", "swirl", "motes", "embers", "flames", "decal"],
  launch: ["flare", "slash", "cone", "beam", "shockwave", "sparks"],
  flight: ["bolt", "arrow", "ribbon", "sparks", "embers", "smoke"],
  impact: ["burst", "flare", "sparks", "shards", "ring", "shockwave", "smoke"],
  channel: ["sparks", "flare", "ring", "motes", "burst"],
};
const FIRST_SOUNDS = {
  cast: ["cast", "shimmer"],
  launch: ["whoosh", "slash", "bowshot", "shout"],
  impact: ["impact", "hit-metal", "hit-soft", "explosion", "heal"],
  channel: ["cast", "shimmer", "lightning"],
};
const SCHOOL_SOUNDS = ["holy", "fire", "nature", "frost", "shadow", "arcane"];
const VISUAL_LABELS = { flare: "Flash", decal: "Circle on the ground", ribbon: "Trail", scorch: "Scorch mark", cone: "Cone", sparks: "Sparks" };
const SOUND_HIDDEN = /^step-|^(coins|loot-cloth|level-up|death|mob-|miss$)/;

const capitalized = (name) => `${name[0].toUpperCase()}${name.slice(1).replaceAll("-", " ")}`;
const visualLabel = (effect) => VISUAL_LABELS[effect] ?? capitalized(effect);
const hasFlight = (ability) => Boolean(ability.speed) && ["enemy", "ally", "any"].includes(ability.target);

export function momentsOf(ability) {
  return [
    ...(ability.castTime || ability.channel ? [{ when: "cast", label: ability.channel ? "While it channels" : "While it casts" }] : []),
    { when: "launch", label: "As it goes off" },
    ...(hasFlight(ability) ? [{ when: "flight", label: "On its way" }] : []),
    ability.channel ? { when: "channel", label: "Each tick" } : { when: "impact", label: "Where it lands" },
  ];
}

// A bolt or arrow on its way is written as what's let go when it launches.
const whenOf = (when, effect) => (when === "flight" && PROJECTILES.includes(effect) ? "launch" : when);
const isAt = (ability, when) => (visual) => {
  const projectile = hasFlight(ability) && visual.when === "launch" && PROJECTILES.includes(visual.effect);
  return when === "flight" ? visual.when === "flight" || projectile : visual.when === when && !projectile;
};
const visualsAt = (ability, when) => (ability.visuals ?? []).filter(isAt(ability, when));

// Which visuals are at this moment, any number of them, so they layer. A new one takes the colors of those it joins.
export function toggleVisual(ability, when, effect) {
  const at = isAt(ability, when);
  const held = (ability.visuals ?? []).find((v) => at(v) && v.effect === effect);
  if (held) {
    setKey(ability, "visuals", ability.visuals.filter((v) => v !== held));
    return;
  }
  const visual = { effect, when: whenOf(when, effect) };
  const colors = ability.visuals?.find((v) => v.colors)?.colors;
  if (colors) visual.colors = colors;
  if (when === "cast" && HELD.includes(effect)) visual.duration = "cast";
  ability.visuals = [...(ability.visuals ?? []), visual];
}

export function visualStrip(ability, when) {
  const first = FIRST_VISUALS[when];
  const offered = first.filter((effect) => effect !== "ribbon" || when === "flight");
  const rest = VISUALS.filter((effect) => !offered.includes(effect));
  const on = visualsAt(ability, when).map((v) => v.effect);
  return {
    name: `what shows, ${when}`,
    options: offered.map((value) => ({ value, label: visualLabel(value) })),
    more: rest.map((value) => ({ value, label: visualLabel(value) })),
    owner: ability,
    moreName: when,
    many: on,
    pick: (v) => toggleVisual(ability, when, v),
  };
}

export function sizeStrip(ability, when) {
  const visuals = visualsAt(ability, when);
  if (!visuals.length) return null;
  const sizes = new Set(visuals.map((v) => v.scale ?? 1));
  return {
    name: `size, ${when}`,
    options: options([[0.6, "Small"], [1, "Medium"], [1.5, "Large"], [2.2, "Huge"]]),
    value: sizes.size === 1 ? [...sizes][0] : undefined,
    pick: (v) => visuals.forEach((visual) => setKey(visual, "scale", v === 1 ? undefined : v)),
  };
}

// One sound to a moment here, and the others stay on if there are more in the list below.
const soundsAt = (ability, when) => (ability.sounds ?? []).filter((s) => s.when === when);

export function setSound(ability, when, sound) {
  const [first] = soundsAt(ability, when);
  if (!sound) {
    setKey(ability, "sounds", (ability.sounds ?? []).filter((s) => s.when !== when));
    return;
  }
  if (first) first.sound = sound;
  else ability.sounds = [...(ability.sounds ?? []), { sound, when }];
}

export function soundStrip(ability, when) {
  if (when === "flight") return null;
  const first = [...(SCHOOL_SOUNDS.includes(ability.school) ? [ability.school] : []), ...FIRST_SOUNDS[when].filter((sound) => sound !== ability.school)];
  const rest = SOUNDS.filter((sound) => !first.includes(sound) && !SOUND_HIDDEN.test(sound));
  const held = soundsAt(ability, when)[0]?.sound ?? "";
  const known = [...first, ...rest].includes(held) || !held;
  const option = (value) => ({ value, label: `♪ ${capitalized(value)}` });
  return {
    name: `what you hear, ${when}`,
    options: [{ value: "", label: "Silent" }, ...first.map(option), ...(known ? [] : [option(held)])],
    more: rest.map(option),
    owner: ability,
    moreName: `sound ${when}`,
    value: held,
    pick: (v) => setSound(ability, when, v),
  };
}

// Colors go over all of its visuals, and leaving them out takes its school's.
const NAMED_COLORS = Object.entries(SCHOOL_COLORS);

export function colorStrip(ability) {
  const visuals = ability.visuals ?? [];
  if (!visuals.length) return null;
  const held = new Set(visuals.map((v) => (v.colors ? v.colors.join() : "")));
  return {
    name: "colors",
    options: [{ value: "", label: "Its school's colors" }, ...NAMED_COLORS.map(([school, colors]) => ({ value: colors.join(), label: capitalized(school), swatch: school }))],
    value: held.size === 1 ? [...held][0] : undefined,
    pick: (v) => visuals.forEach((visual) => setKey(visual, "colors", v ? v.split(",") : undefined)),
  };
}

// A look to start from, for what the ability is. It has to have nothing of its own yet.
export const hasNoLook = (ability) => !ability.visuals?.length && !ability.sounds?.length;

export function suggestLook(ability) {
  const school = SCHOOL_SOUNDS.includes(ability.school) ? ability.school : null;
  const heals = (ability.effects ?? []).some((e) => e.type === "heal");
  const area = (ability.effects ?? []).some((e) => ["enemies", "allies"].includes(e.affects));
  const visuals = [];
  const sounds = [];
  if (ability.castTime || ability.channel) {
    visuals.push({ effect: "glow", when: "cast", on: "caster", duration: "cast" });
    sounds.push({ sound: "cast", when: "cast" });
  }
  if (isMelee(ability)) sounds.push({ sound: "whoosh", when: "launch" });
  else if (ability.speed) visuals.push({ effect: "bolt", when: "launch" });
  if (ability.speed && !isMelee(ability)) sounds.push({ sound: school ?? "whoosh", when: "launch" });
  const landing = ability.channel ? "channel" : "impact";
  if (heals) {
    visuals.push({ effect: "motes", when: landing });
    sounds.push({ sound: "heal", when: landing });
  } else if (area) {
    visuals.push({ effect: "shockwave", when: landing });
    sounds.push({ sound: school ?? "explosion", when: landing });
  } else if (isMelee(ability) && !school) {
    visuals.push({ effect: "sparks", when: landing });
    sounds.push({ sound: "hit-metal", when: landing });
  } else {
    visuals.push({ effect: "burst", when: landing });
    sounds.push({ sound: school ?? "impact", when: landing });
  }
  ability.visuals = visuals;
  ability.sounds = sounds;
}

// With no cast any more, what played through it plays as the ability goes off, and has nothing to last through.
export function settleLook(ability) {
  if (ability.castTime || ability.channel) return;
  for (const entry of [...(ability.visuals ?? []), ...(ability.sounds ?? [])]) {
    if (entry.when === "cast") entry.when = "launch";
    if (entry.duration === "cast") delete entry.duration;
  }
}

const AURAS = ["glow", "swirl", "motes", "embers", "flames", "smoke", "shield", "ring"];
export function auraStrip(status) {
  const held = status.aura?.effect ?? "";
  return {
    name: "what shows on who has it",
    options: [{ value: "", label: "Nothing shows" }, ...[...AURAS, ...(held && !AURAS.includes(held) ? [held] : [])].map((value) => ({ value, label: visualLabel(value) }))],
    value: held,
    pick: (v) => {
      if (!v) delete status.aura;
      else status.aura = { duration: "status", ...status.aura, effect: v };
    },
  };
}
