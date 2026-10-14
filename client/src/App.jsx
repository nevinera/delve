import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const RESPAWN_DELAY_S = 10;
import Canvas from "./Canvas";
import { Joystick } from "./Joystick";
import { angleToMovementKeys } from "./joystickAngle";
import { GameConnection } from "./game/connection";
import { firePowerEffects } from "./game/effectPlayback";
import { canTargetUnit, isUntargetableStatus } from "./game/state";
import { hasLineOfSight } from "./game/collision";
import { canKeepTalking, canTalkTo } from "./game/dialogue";
import { DialogueWindow } from "./DialogueWindow";
import { activeQuestsById, applyQuestAction, offersFor, questLogZones, questMessageAction, questNcus, questsById, turnInsFor, zoneNames } from "./game/quests";
import { inUseRange } from "./game/interactables";
import { QuestLog } from "./QuestLog";
import { AtlasWindow } from "./AtlasWindow";
import { visitedMessageKey, visitKeys } from "./game/atlasVisibility";
import { buildStatusCatalog, mergeStatusCatalogs } from "./game/statusCatalog";
import { resolveStockAssetUrl } from "./resolveStockAssetUrl";
import { useViewportMode } from "./useViewportMode";
import { AbilityTooltip } from "./AbilityTooltip";
import { hastedGlobalCooldown } from "./abilityEffectText";
import { ClassSheet } from "./ClassSheet";
import SettingsDialog from "./SettingsDialog";
import { actionForEvent, customOverrides, actionForKeyUp, bindingLabel, buildBindingIndex, MOVEMENT_ACTIONS, resolveHotkeys, TURN_ACTIONS } from "./hotkeys";
import { assignPowerToButton, layoutToMap, resolveButtonLayout, saveCharacterSettings } from "./abilityButtons";
import { darkenHexColor } from "./darkenColor";
import ExpiryBanner from "./ExpiryBanner";
import { worldMessageAction } from "./game/worldMessages";
import { lootFailureMessages } from "./game/lootMessages";
import { fetchVerifiedJson, ContentChecksumError } from "./game/verifiedFetch";
import { FlagCache } from "./game/flags";
import { redirectTo } from "./redirectTo";
import { leaveWorld } from "./game/leaveWorld";
import IconImage from "./IconImage";
import GearRestrictionPrompt from "./GearRestrictionPrompt";
import { itemAllowed, disallowedItems } from "./game/provenance";


// Portrait phone action bar: two full-width rows of 5, spanning the whole
// screen instead of a compact corner grid (there's no side panel in
// portrait to keep it narrow). Each row reads right-to-left as 1..10 - the
// arrays below are left-to-right DOM/render order, so they're reversed
// relative to that reading order. Row 0 (top) = slots 6-10, row 1 (bottom)
// = slots 1-5, matching the on-screen top-to-bottom layout.
export const ACTION_ROWS_PORTRAIT = [
  [9, 8, 7, 6, 5],
  [4, 3, 2, 1, 0],
];

// Landscape control panels: preferred/floor sizing for the ability-button
// grid, shared between the panel's CSS min-width (so the panel itself grows
// to make room, stealing width from the scene panel in the middle) and the
// JS fallback below (only needed once the panel is already as wide as it
// can get and there's still not enough vertical room).
export const LANDSCAPE_ACTION_BUTTON_SIZE = 43;
export const LANDSCAPE_ACTION_BUTTON_GAP = 8;
export const LANDSCAPE_ACTION_BUTTON_MIN_SIZE = 28;
const LANDSCAPE_PANEL_PADDING = 8;
// Widest the panel ever needs to be to fit 3 full-size columns.
export const LANDSCAPE_PANEL_MIN_WIDTH =
  3 * LANDSCAPE_ACTION_BUTTON_SIZE + 2 * LANDSCAPE_ACTION_BUTTON_GAP + 2 * LANDSCAPE_PANEL_PADDING;

// Landscape's ability-button grid: for each candidate column count, compute
// the largest button size that actually fits the pane (bounded by both its
// width and its height), then pick whichever column count wins the biggest
// buttons - preferring fewer columns on a tie. This naturally covers the
// whole range: 2 full-size columns when there's room, 3 full-size columns
// when 2 would run too tall, and - if the pane is squeezed on both axes at
// once - whichever of 2 or 3 shrunk columns comes out larger, rather than
// being stuck re-trying a 2-column layout that doesn't fit either.
export function fitActionGridColumns({ itemCount, width, height, gap, size, minSize }) {
  if (!(width > 0) || !(height > 0)) return { columns: 2, rows: Math.ceil(itemCount / 2), size };
  const candidate = (cols) => {
    const rows = Math.ceil(itemCount / cols);
    const sizeByWidth = (width - (cols - 1) * gap) / cols;
    const sizeByHeight = (height - (rows - 1) * gap) / rows;
    return { columns: cols, rows, size: Math.min(size, sizeByWidth, sizeByHeight) };
  };
  const two = candidate(2);
  const three = candidate(3);
  const best = three.size > two.size + 0.01 ? three : two;
  return { ...best, size: Math.max(minSize, best.size) };
}

// ?debugStatuses=N appends N fake buffs and N fake debuffs to both status
// bars, for eyeballing layout without needing real statuses applied in a
// live game. shortName is capped at 6 chars (see
// Validators::StatusValidator::SHORT_NAME_MAX_LENGTH server-side) - slicing
// keeps this safe even for a two-digit N.
export function buildDebugStatuses(n, now) {
  const entry = (i, treatAs, label, shortPrefix) => ({
    key: `debug-${treatAs}-${i}`,
    shortName: `${shortPrefix}${i}`.slice(0, 6),
    treatAs,
    expiresAt: now + 999000,
    name: `Fake ${label} ${i}`,
    description: `Debug placeholder ${label.toLowerCase()} #${i}`,
    appliedByName: null,
  });
  const buffs = Array.from({ length: n }, (_, idx) => entry(idx + 1, "buff", "Buff", "FBuff"));
  const debuffs = Array.from({ length: n }, (_, idx) => entry(idx + 1, "debuff", "Debuff", "FDbuf"));
  return [...buffs, ...debuffs];
}

// Flat placeholder basic-attack values; must match command.characterBasicAttackRange
// and command.characterBasicAttackInterval in the game server.
const BASIC_ATTACK_RANGE = 5.0;
const BASIC_ATTACK_INTERVAL_MS = 2000;

// Built-in graphics/sounds for a unit's basic attack ("power_name": "Basic Attack"
// on a combat event). Served by the Rails app itself, not content-authored, so
// they have no associated zone/class - sourceURLs are resolved against this
// app's own origin rather than a zone's or class's config_url. NPCs get a red
// (or style-appropriate) tint; characters get orange and a 20% larger graphic.
//
// NPC_BASIC_ATTACK_STYLE_POWERS is keyed by UnitType.basicAttackStyle (see
// docs/schema/unit_type.md) - one entry per value in
// instanceconfig.BasicAttackStyles. A unit_type that omits basicAttackStyle
// falls back to "sword"/"arrow"/"arcane" by basicAttackSchool/basicAttackRange
// (see the lookup at its use site below), so existing content keeps its exact
// prior visual/audio without opting in.
const NPC_BASIC_ATTACK_POWER = {
  name: "Basic Attack",
  graphicEffects: [
    {
      sourceURL: "/abilities/graphics/sword-swing.sprites3x3.png",
      duration: 0.75,
      from: "affected",
      when: "impact",
      condition: "onHit",
      opacity: 0.5,
      color: "ff0000",
      spriteColumns: 3,
      spriteRows: 3,
      spriteFrameRate: 12,
    },
  ],
  soundEffects: [
    {
      sourceURL: "/abilities/sounds/thud.ogg",
      duration: 0.12,
      location: "affected",
      when: "impact",
      condition: "onHit",
      volumeScale: 0.02,
    },
  ],
};

const NPC_RANGED_BASIC_ATTACK_POWER = {
  name: "Basic Attack",
  graphicEffects: [
    {
      sourceURL: "/abilities/graphics/spinning-arrow.sprites2x4.png",
      duration: 0.4,
      from: "self",
      to: "affected",
      when: "immediate",
      condition: "onHit",
      opacity: 0.5,
      color: "ff0000",
      spriteColumns: 2,
      spriteRows: 4,
      spriteFrameRate: 12,
    },
  ],
  soundEffects: [
    {
      sourceURL: "/abilities/sounds/twang.ogg",
      duration: 0.3,
      location: "self",
      when: "immediate",
      condition: "onHit",
      volumeScale: 0.03,
    },
    {
      sourceURL: "/abilities/sounds/thud.ogg",
      duration: 0.12,
      location: "affected",
      when: "impact",
      condition: "onHit",
      volumeScale: 0.02,
    },
  ],
};

const NPC_MAGIC_BASIC_ATTACK_POWER = {
  name: "Basic Attack",
  graphicEffects: [
    {
      sourceURL: "/abilities/graphics/magic-ball.sprites3x3.png",
      duration: 0.4,
      from: "self",
      to: "affected",
      when: "immediate",
      condition: "onHit",
      opacity: 0.5,
      color: "ff4500",
      spriteColumns: 3,
      spriteRows: 3,
      spriteFrameRate: 12,
    },
  ],
  soundEffects: [
    {
      sourceURL: "/abilities/sounds/whoomph.ogg",
      duration: 1.8,
      location: "affected",
      when: "impact",
      condition: "onHit",
      volumeScale: 0.05,
    },
  ],
};

// claw: a short slash placed directly on the target, no travel time.
const NPC_CLAW_BASIC_ATTACK_POWER = {
  name: "Basic Attack",
  graphicEffects: [
    {
      sourceURL: "/abilities/graphics/claw-slash.png",
      duration: 0.4,
      from: "affected",
      when: "impact",
      condition: "onHit",
      opacity: 0.6,
      color: "ff0000",
    },
  ],
  soundEffects: [
    {
      sourceURL: "/abilities/sounds/slash.ogg",
      duration: 0.2,
      location: "affected",
      when: "impact",
      condition: "onHit",
      volumeScale: 0.03,
    },
  ],
};

// axe: the sword-swing sprite at a heavier scale, with a chopping thud.
const NPC_AXE_BASIC_ATTACK_POWER = {
  name: "Basic Attack",
  graphicEffects: [
    {
      sourceURL: "/abilities/graphics/sword-swing.sprites3x3.png",
      duration: 0.85,
      from: "affected",
      when: "impact",
      condition: "onHit",
      opacity: 0.5,
      color: "ff0000",
      scale: 1.3,
      spriteColumns: 3,
      spriteRows: 3,
      spriteFrameRate: 9,
    },
  ],
  soundEffects: [
    {
      sourceURL: "/abilities/sounds/crunch.ogg",
      duration: 0.25,
      location: "affected",
      when: "impact",
      condition: "onHit",
      volumeScale: 0.03,
    },
  ],
};

// club: a blunt splat placed on the target rather than a bladed swing.
const NPC_CLUB_BASIC_ATTACK_POWER = {
  name: "Basic Attack",
  graphicEffects: [
    {
      sourceURL: "/abilities/graphics/splat.png",
      duration: 0.5,
      from: "affected",
      when: "impact",
      condition: "onHit",
      opacity: 0.5,
      color: "ff0000",
    },
  ],
  soundEffects: [
    {
      sourceURL: "/abilities/sounds/thud.ogg",
      duration: 0.12,
      location: "affected",
      when: "impact",
      condition: "onHit",
      volumeScale: 0.04,
    },
  ],
};

// ice: a shard that travels from attacker to target, cracking on impact.
const NPC_ICE_BASIC_ATTACK_POWER = {
  name: "Basic Attack",
  graphicEffects: [
    {
      sourceURL: "/abilities/graphics/shards.sprites7x1.png",
      duration: 0.4,
      from: "self",
      to: "affected",
      when: "immediate",
      condition: "onHit",
      opacity: 0.6,
      color: "66ccff",
      spriteColumns: 7,
      spriteRows: 1,
      spriteFrameRate: 14,
    },
  ],
  soundEffects: [
    {
      sourceURL: "/abilities/sounds/crack.ogg",
      duration: 0.3,
      location: "affected",
      when: "impact",
      condition: "onHit",
      volumeScale: 0.03,
    },
  ],
};

// nature: tendrils erupting at the target's feet, with an organic squelch.
const NPC_NATURE_BASIC_ATTACK_POWER = {
  name: "Basic Attack",
  graphicEffects: [
    {
      sourceURL: "/abilities/graphics/tendrils.sprites5x1.png",
      duration: 0.6,
      from: "affected",
      when: "impact",
      condition: "onHit",
      opacity: 0.6,
      color: "66cc33",
      spriteColumns: 5,
      spriteRows: 1,
      spriteFrameRate: 10,
    },
  ],
  soundEffects: [
    {
      sourceURL: "/abilities/sounds/squelch.ogg",
      duration: 0.25,
      location: "affected",
      when: "impact",
      condition: "onHit",
      volumeScale: 0.03,
    },
  ],
};

// fire: an orange-red fireball that travels from attacker to target, then
// bursts on impact - unlike arcane's blue-white magic-ball, this one visibly
// travels the distance rather than resolving instantly on the target.
const NPC_FIRE_BASIC_ATTACK_POWER = {
  name: "Basic Attack",
  graphicEffects: [
    {
      sourceURL: "/abilities/graphics/magic-ball.sprites3x3.png",
      duration: 0.4,
      from: "self",
      to: "affected",
      when: "immediate",
      condition: "onHit",
      opacity: 0.7,
      color: "ff3300",
      spriteColumns: 3,
      spriteRows: 3,
      spriteFrameRate: 12,
    },
    {
      sourceURL: "/abilities/graphics/radial-burst.png",
      duration: 0.4,
      from: "affected",
      when: "impact",
      condition: "onHit",
      opacity: 0.6,
      color: "ff6600",
    },
  ],
  soundEffects: [
    {
      sourceURL: "/abilities/sounds/boom.ogg",
      duration: 0.4,
      location: "affected",
      when: "impact",
      condition: "onHit",
      volumeScale: 0.04,
    },
  ],
};

// Keyed by UnitType.basicAttackStyle - see instanceconfig.BasicAttackStyles.
const NPC_BASIC_ATTACK_STYLE_POWERS = {
  claw: NPC_CLAW_BASIC_ATTACK_POWER,
  sword: NPC_BASIC_ATTACK_POWER,
  axe: NPC_AXE_BASIC_ATTACK_POWER,
  club: NPC_CLUB_BASIC_ATTACK_POWER,
  arrow: NPC_RANGED_BASIC_ATTACK_POWER,
  arcane: NPC_MAGIC_BASIC_ATTACK_POWER,
  ice: NPC_ICE_BASIC_ATTACK_POWER,
  nature: NPC_NATURE_BASIC_ATTACK_POWER,
  fire: NPC_FIRE_BASIC_ATTACK_POWER,
};

const CHARACTER_BASIC_ATTACK_POWER = {
  name: "Basic Attack",
  graphicEffects: [
    {
      sourceURL: "/abilities/graphics/sword-swing.sprites3x3.png",
      duration: 0.75,
      from: "affected",
      when: "impact",
      condition: "onHit",
      opacity: 0.5,
      color: "ff8c1a",
      scale: 1.2,
      spriteColumns: 3,
      spriteRows: 3,
      spriteFrameRate: 12,
    },
  ],
  soundEffects: [
    {
      sourceURL: "/abilities/sounds/thud.ogg",
      duration: 0.12,
      location: "affected",
      when: "impact",
      condition: "onHit",
      volumeScale: 0.02,
    },
  ],
};

// Green/yellow/red thresholds match what a player would recognize from WoW's
// ping-color convention: <200ms fine, 200-350ms noticeable, 350ms+ rough.
export function latencyColor(ms) {
  if (ms == null) return "#ddd";
  if (ms < 200) return "#4caf50";
  if (ms < 350) return "#ffc107";
  return "#f44336";
}

// Whether to auto-show the latency badge even without the manual L toggle:
// true once more than half of the RTT samples from the last windowMs were
// above thresholdMs - a blip shouldn't pop the badge up, but sustained bad
// latency should, so the player knows it's their connection and not the game.
export function shouldAutoShowLatency(history, now, windowMs = 10000, thresholdMs = 250) {
  const recent = history.filter((e) => now - e.t <= windowMs);
  if (recent.length === 0) return false;
  const overCount = recent.filter((e) => e.rtt > thresholdMs).length;
  return overCount / recent.length > 0.5;
}

// Applies a minimum-visible duration to rawAuto (shouldAutoShowLatency's
// output), so hovering right around the threshold doesn't flicker the badge
// on and off: once it turns on, it stays on for at least minVisibleMs even
// if rawAuto flips back to false in the meantime. `since` is when it last
// turned on (null while off); pass back the returned `since` next call.
export function stickyAutoShow(rawAuto, since, now, minVisibleMs = 10000) {
  if (rawAuto) return { visible: true, since: since ?? now };
  if (since != null && now - since < minVisibleMs) return { visible: true, since };
  return { visible: false, since: null };
}

// Whether the latency badge is actually on screen: the player's explicit L
// choice (override) if they've made one, otherwise whatever
// shouldAutoShowLatency last decided.
export function isLatencyVisible(override, autoShow) {
  return override != null ? override : autoShow;
}

// What `override` should become after an L press: it's a toggle of current
// *visibility*, not of the override itself - so hitting L while the badge
// happens to be auto-shown turns it off (and that off sticks), and hitting
// it while auto-hidden turns it on (and that sticks too), regardless of
// whether a previous override was ever set.
// What Escape does: dismiss whatever is open first, else drop the target, else
// (nothing to dismiss) open the settings menu.
export function escapeAction({ overlayOpen, hasTarget }) {
  if (overlayOpen) return "close";
  return hasTarget ? "detarget" : "settings";
}

export function nextLatencyOverride(override, autoShow) {
  return !isLatencyVisible(override, autoShow);
}

// "3:05", "0:08" - minutes unpadded, seconds zero-padded. Rounds up so a
// status showing "0:01" is still actually active, not already expired.
export function formatRemaining(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Landscape's status rows are tight on space - a max-3-char "16m"/"22s"
// instead of "15:39"/"0:22". Minutes are rounded (not floored) so a status
// that's about to roll from 1m to 0s doesn't read as having longer left
// than it does.
export function formatRemainingCompact(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  return `${Math.round(totalSeconds / 60)}m`;
}

// Mouse-tracked portal tooltip for one status row - mirrors StatEffectTooltip/
// AbilityTooltip's approach. Shown on hover, name+description+applier;
// description is optional (Status.description), and the applier line is
// omitted entirely when it can't be resolved (e.g. they've since left the
// instance) rather than showing a hollow "Applied by Unknown".
function StatusTooltip({ name, description, appliedByName, children }) {
  const [pos, setPos] = useState(null);

  return (
    <span
      className="game-status-tooltip-anchor"
      onMouseEnter={(e) => setPos({ x: e.clientX, y: e.clientY })}
      onMouseMove={(e) => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {pos && createPortal(
        <div className="game-status-tooltip" style={{ left: pos.x + 16, top: pos.y + 16 }}>
          <div className="game-status-tooltip-name">{name}</div>
          {description && <div className="game-status-tooltip-description">{description}</div>}
          {appliedByName && <div className="game-status-tooltip-applied-by">Applied by {appliedByName}</div>}
        </div>,
        document.body
      )}
    </span>
  );
}

// Mouse-tracked portal tooltip for a plain text hint - same approach as
// StatusTooltip/ItemTooltip/StatEffectTooltip, styled like statusTooltip.
// cursor: "default" keeps the standard arrow (not the browser's text-select
// cursor, which a plain div with text would otherwise show).
function HintTooltip({ text, children }) {
  const [pos, setPos] = useState(null);

  return (
    <span
      className="game-hint-tooltip-anchor"
      onMouseEnter={(e) => setPos({ x: e.clientX, y: e.clientY })}
      onMouseMove={(e) => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {pos && createPortal(
        <div className="game-status-tooltip" style={{ left: pos.x + 16, top: pos.y + 16 }}>
          <div className="game-status-tooltip-name">{text}</div>
        </div>,
        document.body
      )}
    </span>
  );
}

function StatusColumn({ entries, color, landscape, align }) {
  const format = landscape ? formatRemainingCompact : formatRemaining;
  return (
    <div className="game-status-column">
      {entries.map(({ key, shortName, remainingMs, name, description, appliedByName }) => (
        <StatusTooltip key={key} name={name} description={description} appliedByName={appliedByName}>
          <div className={landscape ? "game-status-row-landscape" : "game-status-row"} style={{ color, ...(align ? { textAlign: align } : {}) }}>
            {format(remainingMs)} {shortName}
          </div>
        </StatusTooltip>
      ))}
    </div>
  );
}

// Buffs and debuffs (only - "inherent" statuses have no meaningful
// countdown to show) sorted ascending by time remaining. Desktop/portrait
// anchor to the bottom, so the row with the most time left ends up last and
// the whole thing visually grows upward as more statuses land; landscape
// anchors to the top instead (see statusBarLeftLandscape/RightLandscape),
// where there's room above the frame/controls but not below them. `side`
// only picks which edge of the screen it's anchored to (self: left,
// target: right) - the buff/debuff column order (buffs, then debuffs)
// stays the same either way. `landscape` swaps to the stacked (buffs above
// debuffs), smaller-font, compact-duration variant - there's no room for
// buffs/debuffs side by side with mm:ss timers there.
export function StatusBar({ statuses, now, side = "left", landscape }) {
  const withRemaining = statuses
    .map((s) => ({ ...s, remainingMs: s.expiresAt - now }))
    .filter((s) => s.remainingMs > 0)
    .sort((a, b) => a.remainingMs - b.remainingMs);
  const buffs = withRemaining.filter((s) => s.treatAs === "buff");
  const debuffs = withRemaining.filter((s) => s.treatAs === "debuff");
  if (!buffs.length && !debuffs.length) return null;

  const containerClass = landscape
    ? (side === "right" ? "game-status-bar-right-landscape" : "game-status-bar-left-landscape")
    : (side === "right" ? "game-status-bar-right" : "game-status-bar-left");
  // Belt-and-suspenders alongside statusColumn's width:max-content - even
  // if a row's box ends up a hair wider than its text, explicit textAlign
  // still hugs the text to the pane's outer edge instead of leaving it
  // hanging past it.
  const align = landscape ? (side === "right" ? "right" : "left") : undefined;

  return (
    <div className={containerClass}>
      <StatusColumn entries={buffs} color="#5ec95e" landscape={landscape} align={align} />
      <StatusColumn entries={debuffs} color="#ff5c5c" landscape={landscape} align={align} />
    </div>
  );
}

// A unit's in-progress cast (see instance/messages.go's unitJSON casting_*
// fields), rendered as a filling progress bar with the power's name - driven
// entirely by server-pushed state, same as every other live combat overlay
// here (StatusBar, UnitResourceBars). Renders nothing when the unit isn't
// casting; unmounts naturally (no special cancel handling needed) the
// instant the server stops reporting casting_power - whether the cast
// completed, was cancelled by movement, or aborted on the target's death.
//
// The fill animates via a CSS width transition kicked off on mount (0% ->
// 100% over however long is left) rather than a per-frame/per-second JS
// tick recomputing a percentage - cheaper, and smoother than the 1s
// countdown granularity StatusBar's own re-render tick uses. Keyed by
// cast_started_at so a *new* cast (even of the same power) restarts the
// animation instead of jumping.
// inline: renders in-flow (no absolute positioning) at full width, for
// embedding directly in a unit frame next to HealthBar/UnitResourceBars -
// the target's cast bar in particular needs to live there so it's legible
// as "this specific unit is casting", rather than an ambiguous screen-edge
// element. Unlike the floating variant (which mounts/unmounts with
// power/startedAt/endsAt present or not - fine, since position:absolute
// never affects layout either way), inline *always* renders its full-size
// container, whether or not the unit is currently casting: the frame's
// other rows (health, resources) sit in normal document flow, so an inline
// cast bar popping in and out of the DOM would shove them up and down every
// time a cast starts or ends. Instead it just fades to fully transparent
// (not `visibility: hidden`, which would still reserve space but is a less
// direct way to say "blend into the background") while idle, keeping its
// box present at all times.
export function CastBar({ unit, position = "top", inline = false }) {
  const power = unit?.casting_power;
  const startedAt = unit?.cast_started_at;
  const endsAt = unit?.cast_ends_at;
  const casting = !!(power && startedAt && endsAt);
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    setFilled(false);
    if (!casting) return undefined;
    const id = requestAnimationFrame(() => setFilled(true));
    return () => cancelAnimationFrame(id);
  }, [startedAt, endsAt, casting]);

  if (!inline && !casting) return null; // floating variant: absolutely positioned, so absent-when-idle costs nothing

  const remainingMs = casting ? Math.max(0, endsAt - Date.now()) : 0;
  const containerClass = inline ? "game-cast-bar-inline" : (position === "top" ? "game-cast-bar-top" : "game-cast-bar-bottom");
  const trackClass = inline ? "game-cast-bar-inline-track" : "game-cast-bar-track";
  const labelClass = inline ? "game-cast-bar-inline-label" : "game-cast-bar-label";

  return (
    <div className={containerClass} style={{ opacity: inline && !casting ? 0 : 1 }} data-testid="cast-bar">
      <div className={trackClass}>
        <div className="game-cast-bar-fill" style={{ width: casting && filled ? "100%" : "0%", transitionDuration: `${remainingMs}ms` }} />
      </div>
      <div className={labelClass}>{casting ? power : " "}</div>
    </div>
  );
}

// How long an AbilityErrorBanner stays fully visible before it starts
// fading, and how long the fade itself takes - WoW's UIErrorsFrame ("Not
// enough energy", "Out of range", ...) is the reference point: message
// appears instantly (no fade-in), holds, then fades out on its own.
const ABILITY_ERROR_HOLD_MS = 2200;
const ABILITY_ERROR_FADE_MS = 800;

// A transient "why didn't that work" banner, top-center over the canvas.
// Always remounted by its caller (via a changing `key`, see the
// abilityError state in the component that renders this) even for a
// repeated identical message, so mashing a button you can't afford resets
// the hold/fade cycle instead of leaving a half-faded banner hanging.
// Calls onDone once the fade completes so the caller can drop it from the
// DOM entirely rather than leaving an invisible-but-present node behind.
export function AbilityErrorBanner({ message, onDone }) {
  const [fading, setFading] = useState(false);
  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), ABILITY_ERROR_HOLD_MS);
    const doneTimer = setTimeout(() => onDone(), ABILITY_ERROR_HOLD_MS + ABILITY_ERROR_FADE_MS);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [onDone]);

  return (
    <div
      className="game-ability-error-banner"
      style={{ opacity: fading ? 0 : 1, transitionDuration: `${ABILITY_ERROR_FADE_MS}ms` }}
      data-testid="ability-error-banner"
    >
      {message}
    </div>
  );
}

// A unit's resource (energy/mana/rage/...) rendered as its own bar rather
// than a text readout - half the height of the health bar it sits under.
// color is the resource's own ResourceType.color (a bare hex string, e.g.
// "AADD00" - see docs/schema/resource_type.md); the filled (current) portion
// uses it at full brightness, and the track behind it (the already-spent
// portion) is a darkened version of that same color via darkenHexColor,
// rather than a fixed dark background - so different resources still read
// as visually distinct from each other and from HP. Renders nothing when
// max isn't positive (a unit with no resource at all).
function ResourceBar({ current, max, color, landscape }) {
  if (!(max > 0)) return null;
  const pct = Math.max(0, Math.min(1, (current ?? 0) / max));
  return (
    <div data-testid="resource-bar" className={landscape ? "game-resource-bar-track-landscape" : "game-resource-bar-track"} style={{ background: darkenHexColor(color) }}>
      <div className="game-resource-bar-fill" style={{ width: `${pct * 100}%`, background: color ? `#${color}` : "#888" }} />
    </div>
  );
}

// A unit's resources arrive keyed by name (see instance/messages.go's
// unitJSON.Resources) - these just read one out, defaulting to undefined
// (not 0) when the unit has no such resource, so ResourceBar/SecondaryResourceBar's
// own max<=0 guards correctly render nothing rather than a phantom empty bar.
function resourceCurrent(unit, name) {
  return name ? unit?.resources?.[name]?.current : undefined;
}
function resourceMax(unit, name) {
  return name ? unit?.resources?.[name]?.max : undefined;
}

// A class's secondary resource(s) (everything but the primary - see
// [[character-secondary-resources]]), rendered immediately below the
// primary ResourceBar, at the *same* track height (no taller) so the fixed
// unit-frame doesn't grow. isFluid: true reuses ResourceBar's own continuous
// fill; isFluid: false (the common case - combo points, holy charges) renders
// `max` evenly-sized pips instead, `current` of them filled - a shape that
// reads as "how many do I have" rather than implying a continuous quantity.
// Units never have a secondary resource (only classes do), so this is only
// ever wired up for a player (self, or a target that happens to be self).
function SecondaryResourceBar({ current, max, color, isFluid, landscape }) {
  if (!(max > 0)) return null;
  if (isFluid) return <ResourceBar current={current} max={max} color={color} landscape={landscape} />;
  const count = Math.round(max);
  const filled = Math.max(0, Math.min(count, Math.round(current ?? 0)));
  return (
    <div data-testid="resource-bar" className={`${landscape ? "game-resource-bar-track-landscape" : "game-resource-bar-track"} game-resource-pips`}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="game-resource-pip" style={{ background: i < filled ? (color ? `#${color}` : "#888") : "transparent" }} />
      ))}
    </div>
  );
}

// A unit frame's primary ResourceBar plus any secondary resources beneath it
// - shared by the self and target frames in every layout (desktop, landscape,
// portrait) so none of them can drift out of sync. primaryResource is
// {name, color} or null (another player's resource isn't known client-side,
// so theirs falls back to ResourceBar's default gray). Every bar's max comes
// from the unit's own resources, not the class config, so a unit without a
// given resource renders no bar for it.
export function UnitResourceBars({ unit, primaryResource, secondaryResources = [], landscape }) {
  return (
    <>
      <ResourceBar
        current={resourceCurrent(unit, primaryResource?.name)} max={resourceMax(unit, primaryResource?.name)}
        color={primaryResource?.color} landscape={landscape}
      />
      {secondaryResources.map((r) => (
        <SecondaryResourceBar
          key={r.name} current={resourceCurrent(unit, r.name)} max={resourceMax(unit, r.name)} color={r.color}
          isFluid={r.isFluid} landscape={landscape}
        />
      ))}
    </>
  );
}

function UnitBar({ label, current, max }) {
  const pct = max > 0 ? Math.round((current / max) * 100) : 0;
  return (
    <div className="game-unit-bar">
      {label} {current?.toFixed(0)}/{max?.toFixed(0)} ({pct}%)
    </div>
  );
}

// numbersAlign positions the "HP: current/max" label directly above one end
// of the bar - "end" (self's frame) sits above its right end, "start"
// (target's frame) above its left end, so on-screen both labels land near
// the center of the frames row, next to each other. Omitted entirely
// (rather than defaulting to a side) when the caller doesn't want it shown.
// resourceLabel (e.g. "Energy: 100/100"), when given, sits on the *other*
// end of the same line - always the line's outer edge (self's HP already
// sits at the right, so its resource label ends up at the left; target's
// HP sits at the left, so its resource label lands at the right, matching
// "right-aligned" for the common goblins-as-target case this was written
// for).
// landscape swaps to the big top-of-screen bar instead, with a plain
// percentage (no numbersAlign label) inside its own right edge.
// mirrored (target's landscape bar): fill anchors from the right instead of
// the left, so it empties toward the left (center) rather than the right -
// paired with the percentage text also moving to the bar's left edge.
function HealthBar({ current, max, numbersAlign, landscape, mirrored, resourceLabel }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
  return (
    <div className={landscape ? "game-health-bar-track-landscape" : "game-health-bar-track"}>
      {!landscape && numbersAlign && current != null && max != null && (
        <div className="game-health-bar-label" style={{ [numbersAlign === "start" ? "left" : "right"]: 0 }}>
          HP: {Math.round(current)}/{Math.round(max)}
        </div>
      )}
      {!landscape && resourceLabel && (
        <div className="game-health-bar-label" style={{ [numbersAlign === "start" ? "right" : "left"]: 0 }}>
          {resourceLabel}
        </div>
      )}
      <div className={mirrored ? "game-health-bar-fill-mirrored" : "game-health-bar-fill"} style={{ width: `${pct * 100}%` }} />
      {landscape && (
        <span className={mirrored ? "game-health-bar-pct-landscape-left" : "game-health-bar-pct-landscape"}>
          {Math.round(pct * 100)}
        </span>
      )}
    </div>
  );
}

// Returns the maximum range in feet for a power, or null for self-only powers.
// The JSON range field may be a number (e.g. 5.0) or a [min, max] array.
// The range a power needs its target within, from its first targeted
// effect - self and area (bAll/gAll) effects need no target at all, so a
// power made only of those has no range to check (null).
function powerMaxRange(power) {
  for (const effect of power.effects ?? []) {
    if (["self", "bAll", "gAll"].includes(effect.affects)) continue;
    const r = effect.range;
    if (r == null) continue;
    return Array.isArray(r) ? r[1] : r;
  }
  return null;
}

function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

// "Energy: 100/100" - the label for HealthBar's resourceLabel prop. null
// when there's nothing to show (no resource at all, matching ResourceBar's
// own max<=0 guard). Falls back to a generic "Resource" name when the
// resource's own name isn't known client-side (see targetResource).
function resourceMeterLabel(resource, current, max) {
  if (!(max > 0)) return null;
  const name = resource?.name ? capitalize(resource.name) : "Resource";
  return `${name}: ${Math.round(current ?? 0)}/${Math.round(max)}`;
}

// Target frame color by relationship - mirrors scene.js's HOSTILITY_COLORS
// palette (hostile red / neutral orange / friendly blue, the tint given to
// an NPC's token on the map) for an NPC target, plus a fourth case (green,
// matching selfFrame's own color) for a player character target - Hostility
// is "" for players, so it isn't one of the three NPC hostility values.
// No target selected at all keeps the frame's original static red.
const RELATIONSHIP_COLORS = {
  hostile: { background: "#2b0d0d", borderColor: "#6a2a2a", text: "#ff6b6b" },
  neutral: { background: "#2b1d0d", borderColor: "#6a4a2a", text: "#ffcc80" },
  friendly: { background: "#0d1a2b", borderColor: "#2a4a6a", text: "#90caf9" },
  player: { background: "#0d2b0d", borderColor: "#2a6a2a", text: "#8bd98b" },
};
function targetRelationshipColors(unit) {
  if (!unit) return RELATIONSHIP_COLORS.hostile;
  return RELATIONSHIP_COLORS[unit.hostility || "player"] ?? RELATIONSHIP_COLORS.hostile;
}

function formatUnitName(unit) {
  const raw = unit?.unit_type_identifier || unit?.zone_unit_identifier;
  if (!raw) return "Unknown";
  return raw
    .replace(/^player:/, "")
    .split("_")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const UNIT_STATUS_LABELS = {
  idle: "Idle",
  engaged: "Engaged",
  leashing: "Leashing",
  dead: "Dead",
};

// Fixed to the upper-right corner of the canvas region, shown while
// hovering any token other than the current character.
export function UnitTooltip({ unit, selfUnitId }) {
  if (!unit) return null;

  const tagLabel = unit.tagged_by == null
    ? null
    : unit.tagged_by === selfUnitId
      ? "Tagged by you"
      : "Tagged by another player";

  return (
    <div className="game-unit-tooltip">
      <div className="game-unit-tooltip-name">{formatUnitName(unit)}</div>
      <UnitBar label="HP" current={unit.health} max={unit.max_health} />
      <div className="game-unit-tooltip-status">
        {UNIT_STATUS_LABELS[unit.status] || unit.status}
      </div>
      {tagLabel && <div className="game-unit-tooltip-tag">{tagLabel}</div>}
    </div>
  );
}

const STAT_LABELS = {
  strength: "Strength",
  agility: "Agility",
  intellect: "Intellect",
  stamina: "Stamina",
  crit_rating: "Crit Rating",
  haste_rating: "Haste Rating",
  mastery_rating: "Mastery Rating",
  versatility_rating: "Versatility Rating",
  defence_rating: "Defence Rating",
  recovery_rating: "Recovery Rating",
  basic_attack_dps: "Basic Attack DPS",
};

// Mirrors docs/stats.md's "Item coloration" table (delta up to -15/-5/+5/+15
// -> gray/green/blue/purple, above +15 -> orange), but computed against the
// player's current local elevation rather than a weighted mean.
export function itemColor(item, localElvl) {
  if (item?.elvl == null || localElvl == null) return null;
  const delta = item.elvl - localElvl;
  if (delta <= -15) return "#9d9d9d";
  if (delta <= -5) return "#1eff00";
  if (delta <= 5) return "#0070dd";
  if (delta <= 15) return "#a335ee";
  return "#ff8000";
}

// Mirrors ItemStats::ElevationMultiplier (app/services/item_stats/elevation_multiplier.rb)
// / itemstats.ElevationMultiplier (game-server/internal/itemstats/elevation_multiplier.go).
export function elevationMultiplier(ee) {
  const base = 2 / (1 + Math.pow(3, -ee / 10));
  let taper;
  if (Math.abs(ee) <= 10) taper = 1;
  else if (ee >= -20 && ee < -10) taper = (ee + 20) / 10;
  else if (ee > 10 && ee <= 20) taper = 1 + (ee - 10) / 90;
  else if (ee < -20) taper = 0;
  else taper = 10 / 9;
  return base * taper;
}

// Wraps its children in a hover target that shows a WoW-style item tooltip
// near the cursor. `item` should have {name, slot, elvl, description, stats}.
// `stats` is assumed to be raw (em=1.0, i.e. computed as if the item were
// exactly on-level with itself) - it's rescaled here against `localElvl`
// (the elevation of the map the player is currently on), not shown raw.
// pinned: skips the hover/portal machinery entirely and renders the tooltip
// body inline, always visible - for the item editor's preview pane, which
// wants a persistent live view rather than something you have to hover to
// see (see client/src/itemEditor/ItemPreviewPane.jsx).
export function ItemTooltip({ item, children, clickable, localElvl, pinned }) {
  const [pos, setPos] = useState(null); // {x, y} in viewport coords, or null when hidden

  if (!item) return children;

  const em = (localElvl != null && item.elvl != null) ? elevationMultiplier(item.elvl - localElvl) : 1;
  const color = itemColor(item, localElvl);
  const statOrder = STAT_GROUPS.flatMap(g => g.keys);
  const stats = Object.entries(item.stats || {})
    .map(([key, value]) => [key, value * em])
    .filter(([, v]) => v)
    .sort(([a], [b]) => statOrder.indexOf(a) - statOrder.indexOf(b));

  const body = (
    <div className="game-item-tooltip" style={pinned ? { position: "static" } : { left: pos?.x + 16, top: pos?.y + 16 }}>
      <div className="game-item-tooltip-name">{item.name}</div>
      {(item.slot || item.elvl != null) && (
        <div className="game-item-tooltip-meta">
          {item.elvl != null && <span style={color ? { color } : undefined}>e{item.elvl}</span>}
          {item.elvl != null && item.slot ? " " : ""}
          {item.slot}
        </div>
      )}
      {stats.length > 0 && (
        <div className="game-item-tooltip-stats">
          {stats.map(([key, value]) => (
            <div key={key} className="game-item-tooltip-stat">
              +{value.toFixed(1)} {STAT_LABELS[key] || key}
            </div>
          ))}
        </div>
      )}
      {item.description && (
        <div className="game-item-tooltip-description">{item.description}</div>
      )}
    </div>
  );

  const anchorClass = clickable ? "game-item-tooltip-anchor game-item-tooltip-anchor-clickable" : "game-item-tooltip-anchor";
  if (pinned) {
    return (
      <span className={anchorClass}>
        {children}
        {body}
      </span>
    );
  }

  return (
    <span
      className={anchorClass}
      onMouseEnter={e => setPos({ x: e.clientX, y: e.clientY })}
      onMouseMove={e => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {pos && createPortal(
        // Portaled to document.body: charSheetWrapper (an ancestor for the
        // character sheet / candidate pane) has a CSS transform, which makes
        // it the containing block for position:fixed descendants - without
        // the portal, this tooltip's left/top would resolve against that
        // transformed ancestor instead of the viewport.
        body,
        document.body
      )}
    </span>
  );
}

const EQUIPPED_SLOT_LABELS = {
  head: "Head",
  neck: "Neck",
  shoulders: "Shoulders",
  back: "Back",
  chest: "Chest",
  wrists: "Wrists",
  hands: "Hands",
  waist: "Waist",
  legs: "Legs",
  feet: "Feet",
  ring_1: "Left Ring",
  ring_2: "Right Ring",
  main_hand: "Main Hand",
  off_hand: "Off Hand",
};
const EQUIPPED_SLOT_ORDER = Object.keys(EQUIPPED_SLOT_LABELS);

// Sentinel id for the "Nothing" candidate row, which unequips the slot.
const UNEQUIP_ID = "__unequip__";

// Four-letter abbreviations for the character sheet's equipment table.
const EQUIPPED_SLOT_ABBR = {
  head: "Head",
  neck: "Neck",
  shoulders: "Shld",
  back: "Back",
  chest: "Chst",
  wrists: "Wris",
  hands: "Hand",
  waist: "Belt",
  legs: "Legs",
  feet: "Feet",
  ring_1: "Ring",
  ring_2: "Ring",
  main_hand: "Main",
  off_hand: "OffH",
};

// Mirrors EquippedItem::SLOT_TYPES (app/models/equipped_item.rb) — which
// CharacterItem#slot values are compatible with a given equipped slot.
const EQUIPPABLE_ITEM_SLOTS = {
  ring_1: ["ring"],
  ring_2: ["ring"],
  main_hand: ["main_hand", "one_hand", "two_hand"],
  off_hand: ["off_hand", "one_hand"],
};
function itemSlotsFor(equippedSlot) {
  return EQUIPPABLE_ITEM_SLOTS[equippedSlot] || [equippedSlot];
}

// Effect lines for a secondary stat's current total, per docs/stats.md. Crit
// and Haste are shown as their own marginal contribution (not combined with
// other stats' contributions); Mastery is shown as its full (non-linear)
// converted value rather than a marginal delta. Crit is the exception - its
// formula has a flat 5% base (docs/stats.md), so it's shown as the actual
// total crit chance from this rating rather than just the rating's share of
// it.
// crit_rating/haste_rating are shown here as their itemized-only baseline -
// Strength/Agility/Intellect's own incremental contribution to a specific
// attack type (physical or magic) is shown on those primary stats' own
// tooltips instead (primaryStatEffectLines below), not folded in here.
// Defence Rating's damage-reduction asymptote - see docs/stats.md's
// "Defence Rating and damage reduction" section. Pulled down from 0.9/0.36
// (a fully-itemized tank's ~76% physical DR was, by itself, most of the
// tank/DPS mitigation gap - Avoidance barely differed between them) so a
// fully-itemized tank (r~520) now lands near 50% physical DR instead.
const PHYSICAL_DR_ASYMPTOTE = 0.6;
const MAGIC_DR_ASYMPTOTE = 0.4 * PHYSICAL_DR_ASYMPTOTE;

// Recovery Rating's healing-taken% conversion - see docs/stats.md's
// "Recovery Rating" section / command.HealingTakenPct (game server).
const HEALING_TAKEN_CEILING = 170;
const HEALING_TAKEN_K = 310;
function healingTakenPct(value) {
  return HEALING_TAKEN_CEILING * value / (value + HEALING_TAKEN_K);
}

function secondaryStatEffectLines(key, value) {
  switch (key) {
    case "crit_rating":
      return [`${(5 + value / 15).toFixed(1)}% crit chance`];
    case "haste_rating":
      return [`+${(value / 11.71).toFixed(1)}% haste`];
    case "mastery_rating":
      return [`Mastery ${(10 + (90 * value) / (value + 556.25)).toFixed(1)}`];
    case "versatility_rating":
      return [`+${(value * 0.2).toFixed(1)} Strength, Agility, Intellect, and Defence Rating`];
    case "defence_rating":
      return [
        `${(PHYSICAL_DR_ASYMPTOTE * 100 * value / (value + 98)).toFixed(1)}% physical damage reduction`,
        `${(MAGIC_DR_ASYMPTOTE * 100 * value / (value + 98)).toFixed(1)}% magic damage reduction`,
      ];
    case "recovery_rating":
      return [`+${healingTakenPct(value).toFixed(1)}% healing taken`];
    default:
      return [];
  }
}

// Effect lines for a primary stat's current total, per docs/stats.md.
// Avoidance and the off-primaries' effective Crit/Haste contribution always
// apply regardless of class (see the Versatility section) - Avoidance needs
// `stats` too since Agility always feeds a weaker split of both Physical and
// Magic Avoidance (see docs/stats.md's Avoidance section), not just its own
// type. The actual damage/resource numbers (SwingDamage, SpellDamage,
// ResourcePool) only apply for the primary stat(s) a class actually calls
// its damage/caster stat, so those lines are gated on `primaryStats` (from
// the class config).
function primaryStatEffectLines(key, value, primaryStats, stats) {
  switch (key) {
    case "strength": {
      const lines = [
        `+${(value * PHYSICAL_CRIT_RATING_PER_STRENGTH).toFixed(1)} effective physical Crit Rating`,
        `${avoidancePct(value, stats.agility, AGILITY_PHYSICAL_AVOIDANCE_WEIGHT).toFixed(1)}% physical avoidance chance`,
      ];
      if (primaryStats.includes("strength")) lines.unshift(`+${(value / BASIC_ATTACK_STAT_DIVISOR).toFixed(1)} DPS`);
      return lines;
    }
    case "agility": {
      const lines = [
        `+${(value * PHYSICAL_HASTE_RATING_PER_AGILITY).toFixed(1)} effective physical Haste Rating`,
        `${avoidancePct(stats.strength, value, AGILITY_PHYSICAL_AVOIDANCE_WEIGHT).toFixed(1)}% physical avoidance chance`,
        `${avoidancePct(stats.intellect, value, AGILITY_MAGIC_AVOIDANCE_WEIGHT).toFixed(1)}% magic avoidance chance`,
      ];
      if (primaryStats.includes("agility")) lines.unshift(`+${(value / BASIC_ATTACK_STAT_DIVISOR).toFixed(1)} DPS`);
      return lines;
    }
    case "intellect": {
      const lines = [
        `+${(value * MAGIC_CRIT_RATING_PER_INTELLECT).toFixed(1)} effective magic Crit Rating`,
        `+${(value * MAGIC_HASTE_RATING_PER_INTELLECT).toFixed(1)} effective magic Haste Rating`,
        `${avoidancePct(value, stats.agility, AGILITY_MAGIC_AVOIDANCE_WEIGHT).toFixed(1)}% magic avoidance chance`,
      ];
      if (primaryStats.includes("intellect")) {
        lines.unshift(`+${(value / BASIC_ATTACK_STAT_DIVISOR).toFixed(1)} DPS`);
        lines.push(`+${(value / BASIC_ATTACK_STAT_DIVISOR).toFixed(1)} Spell Damage`);
        lines.push(`+${(value * 10).toFixed(0)} Resource Pool`);
      }
      return lines;
    }
    case "stamina":
      return [`${(280 + value).toFixed(0)} Max HP`];
    default:
      return [];
  }
}

// Wraps a stat label in a hover target that shows its computed effect near
// the cursor - same mouse-tracked portal approach as ItemTooltip, shown
// immediately (no delay) since it's a small, deliberately-targeted label
// rather than something the cursor skates across.
function StatEffectTooltip({ lines, children }) {
  const [pos, setPos] = useState(null);
  if (!lines || lines.length === 0) return children;

  return (
    <span
      className="game-item-tooltip-anchor"
      onMouseEnter={(e) => setPos({ x: e.clientX, y: e.clientY })}
      onMouseMove={(e) => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {pos && createPortal(
        <div className="game-item-tooltip" style={{ left: pos.x + 16, top: pos.y + 16 }}>
          {lines.map((line, i) => <div key={i} className="game-stat-tooltip-line">{line}</div>)}
        </div>,
        document.body
      )}
    </span>
  );
}

// Constants for basicAttackDps - see docs/stats.md's "Basic Attack DPS"
// section. BASE_DPS is a completely naked character's own attack rate (no
// gear, not even Trainee Gear) - matches the game server's basic attack
// formula (game-server/internal/command/basic_attack_handler.go).
// BASIC_ATTACK_STAT_DIVISOR was solved backward from a design target (a
// fully-itemized on-level DPS build should net 5 basic-attack DPS,
// regardless of which of Strength/Agility/Intellect it's built around) -
// Strength/Agility/Intellect solve to ~89/~92/~91 under that target, close
// enough to collapse into one shared divisor.
const BASIC_ATTACK_BASE_DPS = 1;
const BASIC_ATTACK_MISS_CHANCE = 0.05;
const BASIC_ATTACK_CRIT_MULTIPLIER = 2.0;
const BASIC_ATTACK_STAT_DIVISOR = 90;
const PHYSICAL_CRIT_RATING_PER_STRENGTH = 0.6;
const PHYSICAL_HASTE_RATING_PER_AGILITY = 0.6;
const MAGIC_CRIT_RATING_PER_INTELLECT = 0.3;
const MAGIC_HASTE_RATING_PER_INTELLECT = 0.3;

// Avoidance - see docs/stats.md's Avoidance section. Strength/Intellect each
// grant a pure Physical/Magic Avoidance chance at the same 0.6-asymptote
// rate; Agility splits a weaker version of both instead of granting either
// at full rate.
const AGILITY_PHYSICAL_AVOIDANCE_WEIGHT = 0.66;
const AGILITY_MAGIC_AVOIDANCE_WEIGHT = 0.33;
function avoidancePct(primaryValue, agility, agilityWeight) {
  const effective = (primaryValue || 0) + (agility || 0) * agilityWeight;
  return (0.6 * effective / (effective + 250)) * 100;
}

// Computed (not itemized) Basic Attack DPS, plus a breakdown of how it was
// built. Strength/Agility drive a physical basic attack (Strength feeds
// physical Crit, Agility feeds physical Haste, always - see docs/stats.md);
// Intellect drives a magic one, splitting its bonus across both magic
// secondaries instead.
function basicAttackDps(basicAttack, primaryStats) {
  const damageStatKey = primaryStats.find((s) => s === "strength" || s === "agility" || s === "intellect");
  const statDps = basicAttack.stat_contribution / BASIC_ATTACK_STAT_DIVISOR;
  const hastePct = basicAttack.haste_pct;
  const critChancePct = basicAttack.crit_chance_pct;

  const value =
    (BASIC_ATTACK_BASE_DPS + statDps) *
    (1 + hastePct / 100) *
    (1 + (critChancePct / 100) * (BASIC_ATTACK_CRIT_MULTIPLIER - 1)) *
    (1 - BASIC_ATTACK_MISS_CHANCE);

  const lines = [`${BASIC_ATTACK_BASE_DPS.toFixed(1)} base`];
  if (damageStatKey) lines.push(`+${statDps.toFixed(1)} from ${STAT_LABELS[damageStatKey]}`);
  lines.push(`+${hastePct.toFixed(1)}% haste`, `${critChancePct.toFixed(1)}% crit chance`, `${(BASIC_ATTACK_MISS_CHANCE * 100).toFixed(1)}% miss chance`);

  return {value, lines};
}

const ZERO_SCHOOL_STATS = { haste_pct: 0, crit_chance_pct: 5, stat_contribution: 0 };

const STAT_GROUPS = [
  { title: "Primary", keys: ["strength", "agility", "intellect", "stamina", "basic_attack_dps"] },
  { title: "Secondary", keys: ["crit_rating", "haste_rating", "mastery_rating", "versatility_rating", "defence_rating", "recovery_rating"] },
];

// Fallback label derived from an item's identifier, for the rare case a
// payload is missing its display name.
export function formatItemName(identifier) {
  if (!identifier) return "—";
  return identifier
    .replace(/[-_]/g, " ")
    .split(" ")
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Mirrors ItemStats::Raw::SLOT_SHAPES's factor (app/services/item_stats/raw.rb)
// / itemstats.slotShapes (game-server/internal/itemstats/raw.go), keyed by
// the item's own `slot` (not the equipped-slot key it's socketed into).
const SLOT_FACTORS = {
  head: 1.5, neck: 1, shoulders: 1, back: 1, chest: 1.5, wrists: 1,
  hands: 1, waist: 1, legs: 1.5, feet: 1, ring: 1,
  main_hand: 2, off_hand: 2, one_hand: 2, two_hand: 4,
};

// Same weights as SLOT_FACTORS, but keyed by equipped-slot (used for empty
// slots, which have no item and thus no item.slot to look up).
const EQUIPPED_SLOT_FACTORS = {
  head: 1.5, neck: 1, shoulders: 1, back: 1, chest: 1.5, wrists: 1,
  hands: 1, waist: 1, legs: 1.5, feet: 1, ring_1: 1, ring_2: 1,
  main_hand: 2, off_hand: 2,
};

// Weighted average of every equip slot's elvl, weighted by its stat factor
// (the same weighting used to scale that slot's stat contribution) - so
// heavier-weighted slots (e.g. a two-hander) pull the average more. Empty
// slots count as elvl 0, rather than being skipped; their weight comes from
// the equipped-slot itself (there's no item.slot to look up when empty) -
// e.g. an empty main_hand always weighs in at 2x, even though a two-hander
// equipped there would weigh 4x.
function gearElevation(equippedItems) {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const equippedSlot of EQUIPPED_SLOT_ORDER) {
    const item = equippedItems?.[equippedSlot];
    const weight = (item?.slot && SLOT_FACTORS[item.slot]) ?? EQUIPPED_SLOT_FACTORS[equippedSlot] ?? 1;
    const elvl = item?.elvl ?? 0;
    weightedSum += elvl * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? weightedSum / totalWeight : null;
}

// Scrollable list of candidate items for one equipped slot, shown to the
// left of the character sheet. Clicking an item equips it into that slot.
function CandidateItemsPane({ slotLabel, loading, items, equippingId, error, onSelect, onClose, localElvl, portrait = false, landscape = false }) {
  return (
    <div className={portrait ? "game-char-sheet-candidate-pane-portrait" : landscape ? "game-char-sheet-candidate-pane-landscape" : "game-char-sheet-candidate-pane"}>
      <div className="game-char-sheet-header">
        <span className="game-char-sheet-candidate-title">{slotLabel}</span>
        <button className="game-loot-close" onClick={onClose}>✕</button>
      </div>
      {error && <div className="game-char-sheet-candidate-error">{error}</div>}
      {loading ? (
        <div className="game-char-sheet-candidate-empty">Loading…</div>
      ) : (
        <div className={(portrait || landscape) ? undefined : "game-char-sheet-candidate-list-wrapper"}>
          <table className="game-char-sheet-candidate-table">
            <tbody>
              {[...items].sort((a, b) => (b.elvl ?? -Infinity) - (a.elvl ?? -Infinity)).map(item => (
                <tr
                  key={item.id}
                  className="game-char-sheet-candidate-row"
                  onClick={equippingId ? undefined : () => onSelect(item)}
                >
                  <td className="game-char-sheet-candidate-elvl-cell" style={itemColor(item, localElvl) ? { color: itemColor(item, localElvl) } : undefined}>
                    {item.elvl ?? ""}
                  </td>
                  <td className="game-char-sheet-candidate-name-cell">
                    <ItemTooltip item={item} clickable localElvl={localElvl}>
                      <span className="game-char-sheet-name-box">
                        {item.name}{equippingId === item.id ? " (equipping…)" : ""}
                      </span>
                    </ItemTooltip>
                  </td>
                </tr>
              ))}
              <tr
                key={UNEQUIP_ID}
                className="game-char-sheet-candidate-row"
                onClick={equippingId ? undefined : () => onSelect(null)}
              >
                <td className="game-char-sheet-candidate-elvl-cell"></td>
                <td className="game-char-sheet-candidate-name-cell">
                  <span className="game-char-sheet-name-box">
                    Nothing{equippingId === UNEQUIP_ID ? " (equipping…)" : ""}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Character sheet: equipped items on the left, summed raw stats on the
// right. Toggled by the "P" hotkey or the action-bar button. Clicking an
// equipped item opens a candidate-item pane to its left; clicking a
// candidate equips it via `onEquip(equippedSlot, item)`, which should
// return null on success or an error message string on failure.
export function CharacterSheet({ open, equippedItems, combatStats, characterItemsUrl, onEquip, onBestAvailable, provenanceRestrictions, onClose, localElvl, primaryStats = [], portrait = false, landscape = false }) {
  const [expandedSlot, setExpandedSlot] = useState(null);
  const [hoveredSlot, setHoveredSlot] = useState(null);
  const [candidateItems, setCandidateItems] = useState([]);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [equippingId, setEquippingId] = useState(null);
  const [equipError, setEquipError] = useState(null);

  useEffect(() => {
    if (!open) setExpandedSlot(null);
  }, [open]);

  useEffect(() => {
    setEquipError(null);
    if (!expandedSlot || !characterItemsUrl) return;
    setCandidateLoading(true);
    const params = new URLSearchParams();
    itemSlotsFor(expandedSlot).forEach(s => params.append("slot[]", s));
    if (provenanceRestrictions) params.append("restrictions", JSON.stringify(provenanceRestrictions.layers));
    const equippedIds = new Set(Object.values(equippedItems || {}).map(i => i.id));
    fetch(`${characterItemsUrl}?${params.toString()}`)
      .then(r => r.json())
      .then(items => setCandidateItems(items.filter(i => !equippedIds.has(i.id))))
      .catch(() => setCandidateItems([]))
      .finally(() => setCandidateLoading(false));
  }, [expandedSlot, characterItemsUrl, equippedItems, provenanceRestrictions]);

  if (!open) return null;

  const stats = combatStats?.stats ?? {};
  const basicAttack = combatStats?.basic_attack ?? ZERO_SCHOOL_STATS;
  const gearElvl = gearElevation(equippedItems);

  // Without an items URL (a zone played directly, wearing imaginary trainee
  // gear) there's nothing to equip from, so slots aren't clickable.
  const canEquip = !!characterItemsUrl;

  const toggleSlot = (slot) => {
    if (!canEquip) return;
    setExpandedSlot(current => (current === slot ? null : slot));
  };

  const handleSelect = async (item) => {
    setEquippingId(item?.id ?? UNEQUIP_ID);
    setEquipError(null);
    const error = await onEquip(expandedSlot, item);
    setEquippingId(null);
    if (error) {
      setEquipError(error);
    } else {
      setExpandedSlot(null);
    }
  };

  const statGroupClass = portrait ? "game-char-sheet-stat-group game-char-sheet-stat-group-portrait" : "game-char-sheet-stat-group";

  const equipmentBlock = (
    <div className="game-char-sheet-column">
      <div className="game-char-sheet-column-title">Equipment</div>
      {canEquip && onBestAvailable && (
        <button className="game-char-sheet-best-available" onClick={onBestAvailable}>Best available</button>
      )}
      <table className="game-char-sheet-equip-table">
        <tbody>
          {EQUIPPED_SLOT_ORDER.map(slot => {
            const item = equippedItems?.[slot];
            const rowClass = [
              "game-char-sheet-equip-row",
              canEquip && "game-char-sheet-equip-row-clickable",
              canEquip && hoveredSlot === slot && "game-char-sheet-equip-row-hover",
              expandedSlot === slot && "game-char-sheet-equip-row-expanded",
            ].filter(Boolean).join(" ");
            return (
              <tr
                key={slot}
                className={rowClass}
                onClick={() => toggleSlot(slot)}
                onMouseEnter={() => setHoveredSlot(slot)}
                onMouseLeave={() => setHoveredSlot(current => (current === slot ? null : current))}
              >
                <td className="game-char-sheet-slot-cell">{EQUIPPED_SLOT_ABBR[slot]}</td>
                <td className="game-char-sheet-elvl-cell" style={itemColor(item, localElvl) ? { color: itemColor(item, localElvl) } : undefined}>
                  {item?.elvl ?? ""}
                </td>
                <td className="game-char-sheet-name-cell">
                  {item ? (
                    <ItemTooltip item={item} clickable localElvl={localElvl}>
                      <span
                        className={itemAllowed(item, provenanceRestrictions) ? "game-char-sheet-name-box" : "game-char-sheet-name-box game-char-sheet-disallowed"}
                        title={itemAllowed(item, provenanceRestrictions) ? undefined : "Not allowed here; it doesn't count"}
                      >
                        {item.name || formatItemName(item.identifier)}
                      </span>
                    </ItemTooltip>
                  ) : (
                    <span className="game-char-sheet-name-box game-char-sheet-empty-slot">Empty</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const statsBlock = (
    <div className="game-char-sheet-column">
      <div className="game-char-sheet-column-title">Stats</div>
      <div className={portrait ? "game-char-sheet-stats-columns" : undefined}>
        <div className={statGroupClass}>
          <ul className="game-char-sheet-stats-list">
            <li className="game-char-sheet-stat-row">
              <span>Local Elevation</span>
              <span>{localElvl ?? "—"}</span>
            </li>
            <li className="game-char-sheet-stat-row">
              <span>Gear Elevation</span>
              <span>{gearElvl != null ? gearElvl.toFixed(1) : "—"}</span>
            </li>
          </ul>
        </div>
        {STAT_GROUPS.map(group => (
          <div key={group.title} className={statGroupClass}>
            <div className="game-char-sheet-stat-group-title">{group.title}</div>
            <ul className="game-char-sheet-stats-list">
              {group.keys.map(key => {
                if (key === "basic_attack_dps") {
                  const {value, lines} = basicAttackDps(basicAttack, primaryStats);
                  return (
                    <li key={key} className="game-char-sheet-stat-row">
                      <StatEffectTooltip lines={lines}>
                        <span className="game-char-sheet-stat-label-hoverable">{STAT_LABELS[key]}</span>
                      </StatEffectTooltip>
                      <span>{value.toFixed(1)}</span>
                    </li>
                  );
                }
                const value = stats[key] || 0;
                const lines = group.title === "Secondary"
                  ? secondaryStatEffectLines(key, value)
                  : primaryStatEffectLines(key, value, primaryStats, stats);
                return (
                  <li key={key} className="game-char-sheet-stat-row">
                    <StatEffectTooltip lines={lines}>
                      <span className={lines.length > 0 ? "game-char-sheet-stat-label-hoverable" : undefined}>
                        {STAT_LABELS[key] || key}
                      </span>
                    </StatEffectTooltip>
                    <span>{value.toFixed(1)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className={portrait ? "game-char-sheet-wrapper-portrait" : landscape ? "game-char-sheet-wrapper-landscape" : "game-char-sheet-wrapper"}>
      {expandedSlot && (
        <CandidateItemsPane
          slotLabel={EQUIPPED_SLOT_LABELS[expandedSlot]}
          loading={candidateLoading}
          items={candidateItems}
          equippingId={equippingId}
          error={equipError}
          onSelect={handleSelect}
          onClose={() => setExpandedSlot(null)}
          localElvl={localElvl}
          portrait={portrait}
          landscape={landscape}
        />
      )}
      <div className={(portrait || landscape) ? "game-char-sheet-scroll-area" : "game-char-sheet"}>
        <div className="game-char-sheet-header">
          <span className="game-char-sheet-title">Character</span>
          <button className="game-loot-close" onClick={onClose}>✕</button>
        </div>
        <div className={portrait ? "game-char-sheet-body-portrait" : "game-char-sheet-body"}>
          {portrait ? (
            <>
              {statsBlock}
              {equipmentBlock}
            </>
          ) : (
            <>
              {equipmentBlock}
              {statsBlock}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const CLAIM_LABEL = {
  upgraded:       "(upgraded)",
  upgrade:        "(upgrading...)",
  locked_for_me:  "(taking...)",
  locked:         "(locked)",
  gone:           "(gone)",
  received:       "(received)",
};

// unitHasLootClaim reports whether characterUnitId holds any claim entry
// (of any state) on lootItems — i.e. whether they tagged the unit.
export function unitHasLootClaim(lootItems, characterUnitId) {
  return !!lootItems?.some(i => i.claims?.some(c => c.character_unit_id === characterUnitId));
}

export function LootWindow({ unitId, unitName, items, selfUnitId, onTake, onClose, localElvl }) {
  const [pos, setPos] = useState({ fx: 0.0, fy: 0.5 }); // {fx, fy} fractional coords of upper-left within canvasWrapper
  const elRef = useRef(null);

  const handleHeaderMouseDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const rect = elRef.current.getBoundingClientRect();
    const parentRect = elRef.current.offsetParent.getBoundingClientRect();
    const originFx = (rect.left - parentRect.left) / parentRect.width;
    const originFy = (rect.top - parentRect.top) / parentRect.height;
    const startX = e.clientX;
    const startY = e.clientY;
    const onMouseMove = (mv) => {
      setPos({
        fx: originFx + (mv.clientX - startX) / parentRect.width,
        fy: originFy + (mv.clientY - startY) / parentRect.height,
      });
    };
    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  if (!items?.length) return null;

  return (
    <div ref={elRef} className="game-loot-window" style={{ left: `${pos.fx * 100}%`, top: `${pos.fy * 100}%`, transform: "none" }}>
      <div className="game-loot-header" onMouseDown={handleHeaderMouseDown}>
        <span className="game-loot-title">Loot{unitName ? `: ${unitName}` : ""}</span>
        <button className="game-loot-close" onClick={onClose}>✕</button>
      </div>
      <table className="game-loot-table">
        <tbody>
          {items.map((item, i) => {
            const myState = item.claims?.find(c => c.character_unit_id === selfUnitId)?.state;
            const owned = myState === "owned";
            const label = CLAIM_LABEL[myState];
            const canTake = myState === "available";
            return (
              <tr key={i} className="game-loot-row">
                <td className="game-loot-name-cell">
                  <ItemTooltip item={item} localElvl={localElvl}>
                    <span className={owned ? "game-loot-item-name game-loot-item-name-owned" : "game-loot-item-name"}>
                      {item.name}
                      {label && <span className="game-loot-owned"> {label}</span>}
                    </span>
                  </ItemTooltip>
                </td>
                <td className="game-loot-meta-cell" style={itemColor(item, localElvl) ? { color: itemColor(item, localElvl) } : undefined}>
                  e{item.elvl}
                </td>
                <td className="game-loot-meta-cell">{item.slot}</td>
                <td className="game-loot-take-cell">
                  {canTake && <button className="game-loot-take" onClick={() => onTake(unitId, i)}>Take</button>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RespawnOverlay({ deathTime, onRespawn }) {
  const [remaining, setRemaining] = useState(RESPAWN_DELAY_S);

  useEffect(() => {
    if (!deathTime) return;
    const update = () => setRemaining(Math.max(0, RESPAWN_DELAY_S - (Date.now() - deathTime) / 1000));
    update();
    const id = setInterval(update, 100);
    return () => clearInterval(id);
  }, [deathTime]);

  if (!deathTime) return null;

  return (
    <div className="game-respawn-overlay">
      {remaining > 0
        ? <span className="game-respawn-countdown">Respawn in {Math.ceil(remaining)}s</span>
        : <button className="game-respawn-button" onClick={onRespawn}>Respawn</button>
      }
    </div>
  );
}

// Blocks the game when the zone or class file the client fetched doesn't
// match what Rails validated (see fetchVerifiedJson) - playing on would mean
// the client and game server disagree about the content.
export function ContentErrorOverlay({ message }) {
  return (
    <div role="alert" className="game-content-error">
      <div className="game-content-error-box">
        <p className="game-content-error-message">{message}</p>
        <p>Reload the page to load the version the server is running.</p>
      </div>
    </div>
  );
}

export default function App({
  slotToken,
  gameServerUrl,
  instanceId,
  slotId,
  zoneSourceUrl,
  // SHA1s Rails validated the zone and class files at; see fetchVerifiedJson.
  zoneSourceSha,
  classConfigSha,
  characterName,
  characterTokenUrl,
  classConfigUrl,
  ownedZoneItems: initialOwnedZoneItems = {},
  equippedItems: initialEquippedItems = {},
  characterItemsUrl,
  equippedItemsUrl,
  // {world_key, layers}: which equipped items count here (see game/provenance.js).
  provenanceRestrictions,
  characterSettings,
  characterSettingsUrl,
  stockAssets,
  // The world's atlas, for the map (see WorldContent::Atlas.payload), or
  // null outside a world or before one is laid out.
  atlas = null,
  // Everywhere in the world the character has been ([{zone, map, place}],
  // see CharacterVisit.in_world), for what the map shows.
  visits: initialVisits = [],
  // Set on a world's zones: the world's play page, which the client goes
  // back to when the player leaves through an exit or the world version
  // expires (see game/worldMessages.js).
  worldReturnUrl,
  // Set on a world's zones: where the menu's "Leave world" sends
  // its DELETE (see game/leaveWorld.js).
  leaveWorldUrl,
  // Set on a build play-test: where the menu's "Leave zone" goes.
  exitUrl,
  // Set on a world's zones: the zone's listed flags the character holds,
  // and the base of the has-flag endpoint for any others (see game/flags.js).
  heldFlags = [],
  flagsUrl,
  zoneIdentifier,
  activeQuestsUrl,
  questsUrl,
  questsSha,
}) {
  const viewportMode = useViewportMode(); // { isTouch, isPhoneLayout, isPortraitPhone, isLandscapePhone }
  const connRef = useRef(null);
  const canvasRef = useRef(null);
  const movementKeysRef = useRef(new Set());
  const turnKeysRef = useRef(new Set());
  const cameraStickRef = useRef({ x: 0, y: 0 }); // right joystick (landscape): continuous console-style camera look
  const facingRef = useRef(0); // degrees
  const selfPosRef = useRef(null); // latest client-predicted position {x, y}
  const selfIdentifierRef = useRef(`player:${characterName}`);
  selfIdentifierRef.current = `player:${characterName}`;
  const [units, setUnits] = useState({});
  const [targetId, setTargetId] = useState(null);
  const [attacking, setAttacking] = useState(false);
  const [latencyMs, setLatencyMs] = useState(null);
  // null = no manual choice yet (visibility follows autoShowLatency); true/false
  // = the player hit L, which sticks regardless of autoShowLatency afterward.
  const [latencyOverride, setLatencyOverride] = useState(null);
  const [autoShowLatency, setAutoShowLatency] = useState(false);
  const autoShowLatencyRef = useRef(false); // mirrors autoShowLatency, for the KeyL handler below
  const lastHeartbeatSeqRef = useRef(null);
  const rttHistoryRef = useRef([]); // {t, rtt}, last 10s - see shouldAutoShowLatency
  const lastLatencyDisplayAtRef = useRef(0); // throttles the displayed number - see below
  const autoShowSinceRef = useRef(null); // when autoShowLatency last turned on - see stickyAutoShow
  const [hoveredUnitId, setHoveredUnitId] = useState(null);
  const unitsRef = useRef({});
  const targetIdRef = useRef(null);
  const [disconnected, setDisconnected] = useState(false);
  // Set when the zone or class file no longer matches what Rails validated;
  // the game can't be trusted to match the server, so it's shown instead.
  const [contentError, setContentError] = useState(null);
  // Epoch ms the world version expires at, or null; drives ExpiryBanner.
  const [expiresAt, setExpiresAt] = useState(null);
  // True once the server has told us to leave (zone exit, version expiry),
  // so the socket closing behind it doesn't read as a disconnect.
  const leavingRef = useRef(false);
  // The character's flags in this world (see game/flags.js); nothing reads
  // it yet.
  const flagCacheRef = useRef(null);
  if (!flagCacheRef.current) flagCacheRef.current = new FlagCache({ heldFlags, flagsUrl });
  const [log, setLog] = useState(["Connecting…"]);
  const [lootWindowUnitId, setLootWindowUnitId] = useState(null);
  const [dialogueNcuId, setDialogueNcuId] = useState(null);
  const [questDefinitions, setQuestDefinitions] = useState({});
  const questDefinitionsRef = useRef({});
  const [questOffers, setQuestOffers] = useState({});
  const questOffersRef = useRef({});
  const questNcuSet = useMemo(() => questNcus(questOffers, questDefinitions), [questOffers, questDefinitions]);
  const [activeQuests, setActiveQuests] = useState({});
  const activeQuestsRef = useRef({});
  activeQuestsRef.current = activeQuests;
  // Quest events that arrive before the log has loaded from Rails, replayed
  // over it once it has (null once loaded).
  const pendingQuestActionsRef = useRef([]);
  const [questLogOpen, setQuestLogOpen] = useState(false);
  const [atlasOpen, setAtlasOpen] = useState(false);
  // Where the character has been, for the map: the visits Rails sent, plus
  // the ones the game server records since (its "visited" messages).
  const [visited, setVisited] = useState(() => visitKeys(initialVisits));
  const [currentZoneNames, setCurrentZoneNames] = useState(null);
  const [questZoneNames, setQuestZoneNames] = useState({});
  const questZones = useMemo(
    () => questLogZones(activeQuests, questDefinitions, {zoneIdentifier, zoneNames: questZoneNames}),
    [activeQuests, questDefinitions, zoneIdentifier, questZoneNames]
  );
  const [ncus, setNcus] = useState({});
  const ncusRef = useRef({});
  const [charSheetOpen, setCharSheetOpen] = useState(false);
  const [classOpen, setClassOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsError, setSettingsError] = useState(null);
  const [buttonLayout, setButtonLayout] = useState(() => resolveButtonLayout(characterSettings?.abilityButtonMap));
  const [cameraSensitivity, setCameraSensitivity] = useState(characterSettings?.cameraSensitivity ?? 1);
  const cameraSensitivityRef = useRef(cameraSensitivity); // read by the scene every frame/drag
  cameraSensitivityRef.current = cameraSensitivity;
  const sensitivitySaveTimerRef = useRef(null);
  const [hotkeys, setHotkeys] = useState(() => resolveHotkeys(characterSettings?.customHotkeys));
  const bindingIndexRef = useRef(buildBindingIndex(hotkeys)); // read by the key handlers so they never go stale
  bindingIndexRef.current = buildBindingIndex(hotkeys);
  const overlayOpenRef = useRef(false); // any loot/char sheet/settings/phone menu open; read by the Escape handler
  const buttonLayoutRef = useRef(buttonLayout);
  buttonLayoutRef.current = buttonLayout;
  // The canvas is letterboxed/pillarboxed (centered, fixed 4:3) within its
  // wrapper - this is its actual on-screen rect, reported by scene.js's
  // handleResize(), for UI meant to sit "inside the canvas" rather than
  // just inside the viewport (e.g. the landscape Chat/Menu buttons).
  const [canvasRect, setCanvasRect] = useState(null);
  // Measures the ability-button pane so the grid can pick its own column
  // count/button size to fit (see fitActionGridColumns) instead of relying
  // on CSS flex-wrap alone, which only reacts to height and lets a too-wide
  // grid bleed past the pane instead of shrinking to fit it.
  const actionGridPaneRef = useRef(null);
  const [actionGridLayout, setActionGridLayout] = useState(null);
  useEffect(() => {
    if (!viewportMode.isLandscapePhone) return undefined;
    const el = actionGridPaneRef.current;
    if (!el) return undefined;
    const compute = () => {
      const { width, height } = el.getBoundingClientRect();
      setActionGridLayout(fitActionGridColumns({
        itemCount: 10, width, height,
        gap: LANDSCAPE_ACTION_BUTTON_GAP, size: LANDSCAPE_ACTION_BUTTON_SIZE, minSize: LANDSCAPE_ACTION_BUTTON_MIN_SIZE,
      }));
    };
    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(el);
    return () => observer.disconnect();
  }, [viewportMode.isLandscapePhone]);
  const [chatOpen, setChatOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [equippedItems, setEquippedItems] = useState(initialEquippedItems);
  const [powers, setPowers] = useState([]);
  const [classInfo, setClassInfo] = useState({});
  const [primaryStats, setPrimaryStats] = useState([]);
  const [primaryResource, setPrimaryResource] = useState(null); // {name, color} | null
  const [secondaryResources, setSecondaryResources] = useState([]); // [{name, color, max, isFluid}] - units never have these, only classes
  const [flashSlot, setFlashSlot] = useState(null);
  const [abilityError, setAbilityError] = useState(null); // {message, key} | null - see AbilityErrorBanner
  const clearAbilityError = useCallback(() => setAbilityError(null), []);
  const showAbilityError = useCallback((message) => setAbilityError({ message, key: Date.now() }), []);
  const [gcdEndsAt, setGcdEndsAt] = useState(0);   // epoch ms; drives cooldown display
  const gcdEndsAtRef = useRef(0);                   // same value, safe to read in callbacks
  const gcdTotalMsRef = useRef(0);                  // duration of the current GCD window
  const npcPowersByZoneIdRef = useRef({});          // { [zoneUnitId]: { [powerName]: power } }
  const npcBasicAttackRangeByZoneIdRef = useRef({}); // { [zoneUnitId]: basicAttackRange }
  const npcBasicAttackSchoolByZoneIdRef = useRef({}); // { [zoneUnitId]: "physical" | "magic" }
  const npcBasicAttackStyleByZoneIdRef = useRef({});  // { [zoneUnitId]: basicAttackStyle | undefined }
  const npcTokenUrlByZoneIdRef = useRef({});          // { [zoneUnitId]: resolved absolute tokenImageUrl }
  const npcResourceByZoneIdRef = useRef({});          // { [zoneUnitId]: {name, color} | undefined }
  const mapBarriersByIdRef = useRef({});             // { [mapIdentifier]: barriers }
  const nextBasicAttackAtRef = useRef(0);           // epoch ms; local prediction of next allowed swing
  const [mapElvls, setMapElvls] = useState({});     // { [mapIdentifier]: elvl }
  const [npcStatusCatalog, setNpcStatusCatalog] = useState({}); // name → { status, baseUrl } across every zone unit type's powers

  const setGcd = useCallback((ms) => {
    gcdEndsAtRef.current = ms;
    setGcdEndsAt(ms);
  }, []);

  // Tick re-renders at 50ms while GCD is active for smooth sweep animation.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (gcdEndsAt <= Date.now()) return;
    const id = setInterval(() => {
      setTick(t => t + 1);
      if (Date.now() >= gcdEndsAt) clearInterval(id);
    }, 50);
    return () => clearInterval(id);
  }, [gcdEndsAt]);


  useEffect(() => {
    if (!classConfigUrl) return;
    fetchVerifiedJson(classConfigUrl, classConfigSha)
      .then(cfg => {
        setPowers(cfg.powers ?? []);
        setClassInfo({name: cfg.name, description: cfg.description});
        setPrimaryStats(cfg.primaryStats ?? []);
        const resources = cfg.resources ?? [];
        const resource = resources.find(r => r.displayType === "primary");
        setPrimaryResource(resource ? {name: resource.name, color: resource.color} : null);
        setSecondaryResources(
          resources
            .filter(r => r.displayType !== "primary")
            .map(r => ({name: r.name, color: r.color, max: r.max, isFluid: r.isFluid}))
        );
      })
      .catch((error) => {
        if (error instanceof ContentChecksumError) setContentError("Your class's file has changed since it was checked.");
      });
  }, [classConfigUrl, classConfigSha]);

  useEffect(() => {
    if (!zoneSourceUrl) return;
    fetchVerifiedJson(zoneSourceUrl, zoneSourceSha)
      .then(zone => {
        const byId = {};
        const basicAttackRangeById = {};
        const basicAttackSchoolById = {};
        const basicAttackStyleById = {};
        const tokenUrlById = {};
        const resourceById = {};
        const barriersByMapId = {};
        const elvls = {};
        for (const map of zone.maps ?? []) {
          for (const unit of map.units ?? []) {
            const ut = zone.unitTypes?.[unit.unitType];
            if (!ut) continue;
            const byName = {};
            for (const p of ut.powers ?? []) {
              byName[p.name] = p;
            }
            byId[unit.identifier] = byName;
            basicAttackRangeById[unit.identifier] = ut.basicAttackRange ?? BASIC_ATTACK_RANGE;
            basicAttackSchoolById[unit.identifier] = ut.basicAttackSchool ?? "physical";
            basicAttackStyleById[unit.identifier] = ut.basicAttackStyle;
            // tokenImageUrl may be a single string or an array of variants
            // (the 3D scene picks one at random per spawn - here we just
            // always show the first, since there's nowhere in this 2D frame
            // to track which variant a given spawn actually rendered with).
            const rawTokenUrl = Array.isArray(ut.tokenImageUrl) ? ut.tokenImageUrl[0] : ut.tokenImageUrl;
            tokenUrlById[unit.identifier] = rawTokenUrl ? new URL(rawTokenUrl, zoneSourceUrl).href : null;
            resourceById[unit.identifier] = ut.resource ? {name: ut.resource.name, color: ut.resource.color} : null;
          }
          barriersByMapId[map.identifier] = map.barriers ?? [];
          elvls[map.identifier] = map.elvl ?? zone.elvl;
        }
        npcPowersByZoneIdRef.current = byId;
        npcBasicAttackRangeByZoneIdRef.current = basicAttackRangeById;
        npcBasicAttackSchoolByZoneIdRef.current = basicAttackSchoolById;
        npcBasicAttackStyleByZoneIdRef.current = basicAttackStyleById;
        npcTokenUrlByZoneIdRef.current = tokenUrlById;
        npcResourceByZoneIdRef.current = resourceById;
        mapBarriersByIdRef.current = barriersByMapId;
        setMapElvls(elvls);
        flagCacheRef.current.preload(zone.flags);
        setCurrentZoneNames(zoneNames(zone));
        // Every unit type's powers, not just spawned units' - a status
        // applied by a unit type nobody's spawned yet at load time would
        // otherwise never resolve.
        const allNpcPowers = Object.values(zone.unitTypes ?? {}).flatMap(ut => ut.powers ?? []);
        setNpcStatusCatalog(buildStatusCatalog(allNpcPowers, zoneSourceUrl));
      })
      .catch((error) => {
        if (error instanceof ContentChecksumError) setContentError("This zone's file has changed since it was checked.");
      });
  }, [zoneSourceUrl, zoneSourceSha]);

  useEffect(() => {
    if (!activeQuestsUrl) return;
    fetch(activeQuestsUrl)
      .then((r) => r.json())
      .then(({quests, zone_names}) => {
        setQuestZoneNames(zone_names ?? {});
        const pending = pendingQuestActionsRef.current ?? [];
        pendingQuestActionsRef.current = null;
        setActiveQuests(pending.reduce((current, action) => applyQuestAction(current, action), activeQuestsById(quests)));
      })
      .catch(() => addLog("Couldn't load your quests."));
  }, [activeQuestsUrl]);

  useEffect(() => {
    if (!questsUrl) return;
    fetchVerifiedJson(questsUrl, questsSha)
      .then((quests) => {
        const byId = questsById(quests);
        questDefinitionsRef.current = byId;
        setQuestDefinitions(byId);
      })
      .catch((error) => {
        if (error instanceof ContentChecksumError) setContentError("This world's quests file has changed since it was checked.");
      });
  }, [questsUrl, questsSha]);

  const addLog = (msg) => setLog((prev) => [...prev.slice(-99), msg]);

  const handleStartAttacking = useCallback(() => {
    connRef.current?.send({ direction: "up", type: "start_attacking" });
    // Optimistic: avoids a visible flash while waiting for server confirmation.
    if (targetIdRef.current) setAttacking(true);
    // Allow the first swing immediately rather than waiting out a stale timer.
    nextBasicAttackAtRef.current = 0;
  }, []);

  const handleStopAttacking = useCallback(() => {
    connRef.current?.send({ direction: "up", type: "stop_attacking" });
    setAttacking(false);
  }, []);

  const handleTargetUnit = useCallback((id) => {
    if (id != null) {
      const self = Object.values(unitsRef.current).find(u => u.zone_unit_identifier === selfIdentifierRef.current);
      const tgt = unitsRef.current[id];
      if (!canTargetUnit(self, tgt)) return;
    }
    targetIdRef.current = id;
    setTargetId(id);
    if (id == null) setAttacking(false);
    connRef.current?.send({
      direction: "up",
      type: "target",
      target_id: id ?? null,
    });
  }, []);

  // Optimistically applies a new button layout, then saves it; reverts on failure.
  const updateButtonLayout = useCallback(async (next) => {
    const previous = buttonLayoutRef.current;
    setButtonLayout(next);
    setSettingsError(null);
    if (!characterSettingsUrl) return;
    try {
      await saveCharacterSettings(characterSettingsUrl, { ability_button_map: layoutToMap(next) });
    } catch (err) {
      setButtonLayout(previous);
      setSettingsError(err.message);
    }
  }, [characterSettingsUrl]);

  // Applies immediately; the save is debounced so dragging the slider sends one request.
  const updateCameraSensitivity = useCallback((value) => {
    setCameraSensitivity(value);
    setSettingsError(null);
    if (!characterSettingsUrl) return;
    clearTimeout(sensitivitySaveTimerRef.current);
    sensitivitySaveTimerRef.current = setTimeout(async () => {
      try {
        await saveCharacterSettings(characterSettingsUrl, { camera_sensitivity: value });
      } catch (err) {
        setSettingsError(err.message);
      }
    }, 400);
  }, [characterSettingsUrl]);

  // Saves a complete set of bindings (as overrides of the defaults) and applies
  // it. Resolves to null on success or an error message.
  const saveHotkeys = useCallback(async (next) => {
    if (!characterSettingsUrl) return "Settings endpoint unavailable.";
    try {
      const saved = await saveCharacterSettings(characterSettingsUrl, { custom_hotkeys: customOverrides(next) });
      setHotkeys(resolveHotkeys(saved.customHotkeys));
      return null;
    } catch (err) {
      return err.message;
    }
  }, [characterSettingsUrl]);

  const usePower = useCallback((slot) => {
    const selfEntryForPower = Object.entries(unitsRef.current).find(([, u]) => u.zone_unit_identifier === selfIdentifierRef.current);
    const selfUnitIdForPower = selfEntryForPower?.[0];
    const selfUnit = selfEntryForPower?.[1];
    if (selfUnit?.status === "dead") return;
    if (Date.now() < gcdEndsAtRef.current) return;
    const power = powers[slot];
    if (!power) return;
    if (power.cooldown > 0) {
      const cdEndsAt = selfUnit?.power_cooldowns?.[power.name] ?? 0;
      if (Date.now() < cdEndsAt) return;
    }
    if (power.costAmount > 0 && (selfUnit?.resources?.[power.costType]?.current ?? 0) < power.costAmount) {
      showAbilityError(`Not enough ${capitalize(power.costType)}`);
      return;
    }
    // Mirror server-side rejection checks so we don't set GCD on commands that
    // will certainly be rejected (target missing, dead, or out of range).
    const range = powerMaxRange(power);
    if (range != null) {
      let target = targetIdRef.current ? unitsRef.current[targetIdRef.current] : null;
      if (!target || isUntargetableStatus(target.status)) {
        const nearestId = Object.entries(unitsRef.current)
          .filter(([, u]) =>
            u.hostility === "hostile" &&
            u.map_identifier === selfUnit?.map_identifier &&
            !isUntargetableStatus(u.status)
          )
          .map(([id, u]) => {
            const dx = u.position.x - (selfUnit?.position.x ?? 0);
            const dy = u.position.y - (selfUnit?.position.y ?? 0);
            return { id, dist: Math.sqrt(dx * dx + dy * dy) };
          })
          .filter(h => h.dist <= 60)
          .sort((a, b) => a.dist - b.dist)[0]?.id ?? null;
        if (!nearestId) return;
        handleTargetUnit(nearestId);
        target = unitsRef.current[nearestId];
      }
      const self = selfPosRef.current;
      if (self) {
        const selfRadius = Object.values(unitsRef.current).find(u => u.zone_unit_identifier === selfIdentifierRef.current)?.radius ?? 0;
        const dx = target.position.x - self.x;
        const dy = target.position.y - self.y;
        if (Math.sqrt(dx * dx + dy * dy) > range + selfRadius + (target.radius ?? 0)) {
          showAbilityError("Out of range");
          return;
        }
        const barriers = mapBarriersByIdRef.current[selfUnit?.map_identifier] ?? [];
        if (!hasLineOfSight(self.x, self.y, target.position.x, target.position.y, barriers)) {
          showAbilityError("Can't see your target");
          return;
        }
        if (power.frontal !== false) {
          const toTarget = Math.atan2(dx, dy) * 180 / Math.PI;
          let diff = toTarget - facingRef.current;
          while (diff > 180) diff -= 360;
          while (diff < -180) diff += 360;
          if (Math.abs(diff) > 75) {
            showAbilityError("You must face your target");
            return;
          }
        }
      }
    }
    const totalMs = hastedGlobalCooldown(power, selfUnit?.combat_stats) * 1000;
    gcdTotalMsRef.current = totalMs;
    setGcd(Date.now() + totalMs);
    connRef.current?.send({ direction: "up", type: "use_power", slot });
    setFlashSlot(slot);
    setTimeout(() => setFlashSlot(null), 150);
    // A cast-time power's effects don't land until the server resolves the
    // cast (see CastBar) - playing them here as if instant would show the
    // graphic/sound firing at the wrong moment (cast start, not
    // completion), so skip the optimistic playback and let the server's own
    // delta trigger it for real when the cast actually finishes.
    if (!power.castTime && (power.graphicEffects?.length || power.soundEffects?.length)) {
      const targetUnit = targetIdRef.current ? unitsRef.current[targetIdRef.current] : null;
      firePowerEffects(power, {
        positions: { self: selfPosRef.current, target: targetUnit?.position, selfId: selfUnitIdForPower, targetId: targetIdRef.current },
        baseUrl: classConfigUrl,
        sceneManager: canvasRef.current,
        stockAssets,
      });
    }
  }, [powers, setGcd, classConfigUrl, handleTargetUnit, stockAssets, showAbilityError]);

  const sendMove = useCallback(() => {
    const pos = selfPosRef.current;
    connRef.current?.send({
      direction: "up",
      type: "move",
      facing: facingRef.current,
      keys: [...movementKeysRef.current],
      ...(pos !== null ? { x: pos.x, y: pos.y } : {}),
      // So the server can ignore a move sent from the map we just left.
      ...(pos?.map ? { map: pos.map } : {}),
    });
  }, []);

  const handleMovementStickMove = useCallback((data) => {
    movementKeysRef.current.clear();
    for (const key of angleToMovementKeys(data.angle.degree)) movementKeysRef.current.add(key);
    sendMove();
  }, [sendMove]);

  const handleMovementStickEnd = useCallback(() => {
    movementKeysRef.current.clear();
    sendMove();
  }, [sendMove]);

  // Left/right only: tilting the camera from the stick was rarely wanted
  // (dragging the scene still does it).
  const handleCameraStickMove = useCallback((data) => {
    cameraStickRef.current = { x: data.vector.x, y: 0 };
  }, []);

  const handleCameraStickEnd = useCallback(() => {
    cameraStickRef.current = { x: 0, y: 0 };
  }, []);

  const handleSelfPosition = useCallback((pos) => {
    selfPosRef.current = pos;
    sendMove();
  }, [sendMove]);

  // Looks up the position sent for a server-echoed move seq (last_move_seq),
  // for SceneManager to reconcile its prediction against - see
  // GameConnection.positionForSeq and scene.js's reconciledTarget.
  const positionForMoveSeq = useCallback((seq) => connRef.current?.positionForSeq(seq) ?? null, []);

  // Called by SceneManager when continuous turning updates the facing angle
  const handleFacingChange = useCallback((degrees) => {
    facingRef.current = ((degrees % 360) + 360) % 360;
    sendMove();
  }, [sendMove]);

  const handleTabTarget = useCallback((unitsSnapshot, currentTargetId, selfId) => {
    const selfUnit = Object.values(unitsSnapshot).find(u => u.zone_unit_identifier === selfId);
    if (!selfUnit) return;

    const hostiles = Object.entries(unitsSnapshot)
      .filter(([, u]) =>
        u.hostility === "hostile" &&
        u.map_identifier === selfUnit.map_identifier &&
        !isUntargetableStatus(u.status) &&
        (canvasRef.current?.isInView(u.position.x, u.position.y) ?? true)
      )
      .map(([id, u]) => {
        const dx = u.position.x - selfUnit.position.x;
        const dy = u.position.y - selfUnit.position.y;
        return { id, dist: Math.sqrt(dx * dx + dy * dy) };
      })
      .filter(h => h.dist <= 60)
      .sort((a, b) => a.dist - b.dist);

    if (hostiles.length === 0) return;
    const currentIdx = hostiles.findIndex(h => h.id === currentTargetId);
    const nextIdx = (currentIdx + 1) % hostiles.length;
    handleTargetUnit(hostiles[nextIdx].id);
  }, [handleTargetUnit]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.repeat) return;
      if (e.code === "Escape") {
        const action = escapeAction({ overlayOpen: overlayOpenRef.current, hasTarget: !!targetIdRef.current });
        if (action === "close") {
          setLootWindowUnitId(null);
          setDialogueNcuId(null);
          setCharSheetOpen(false);
          setQuestLogOpen(false);
          setAtlasOpen(false);
          setClassOpen(false);
          setSettingsOpen(false);
          setMenuOpen(false);
        } else if (action === "detarget") {
          handleTargetUnit(null);
        } else {
          setSettingsOpen(true);
        }
        return;
      }
      const action = actionForEvent(bindingIndexRef.current, e);
      if (!action) return;
      if (action === "toggle_character_sheet") {
        setCharSheetOpen(o => !o);
      } else if (action === "toggle_quest_log") {
        setQuestLogOpen(o => !o);
      } else if (action === "toggle_atlas") {
        setAtlasOpen(o => !o);
      } else if (action === "toggle_latency") {
        setLatencyOverride((current) => nextLatencyOverride(current, autoShowLatencyRef.current));
      } else if (action === "attack_start") {
        handleStartAttacking();
      } else if (action === "attack_stop") {
        handleStopAttacking();
      } else if (action === "target_next") {
        e.preventDefault();
        handleTabTarget(
          // capture current values via refs to avoid stale closure
          unitsRef.current,
          targetIdRef.current,
          selfIdentifier,
        );
      } else if (action.startsWith("ability_")) {
        usePower(buttonLayoutRef.current[Number(action.slice("ability_".length)) - 1]);
      } else {
        const selfForInput = Object.values(unitsRef.current).find(u => u.zone_unit_identifier === selfIdentifierRef.current);
        if (selfForInput?.status === "dead") return;
        if (MOVEMENT_ACTIONS[action]) {
          movementKeysRef.current.add(MOVEMENT_ACTIONS[action]);
          sendMove();
        } else if (TURN_ACTIONS[action]) {
          turnKeysRef.current.add(TURN_ACTIONS[action]);
        }
      }
    };
    const onKeyUp = (e) => {
      const action = actionForKeyUp(bindingIndexRef.current, e);
      if (!action) return;
      if (MOVEMENT_ACTIONS[action]) {
        movementKeysRef.current.delete(MOVEMENT_ACTIONS[action]);
        sendMove();
      } else if (TURN_ACTIONS[action]) {
        turnKeysRef.current.delete(TURN_ACTIONS[action]);
      }
    };
    const onBlur = () => {
      movementKeysRef.current.clear();
      turnKeysRef.current.clear();
      sendMove();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [sendMove, usePower, handleTabTarget, handleTargetUnit, handleStartAttacking, handleStopAttacking]);

  useEffect(() => {
    // Dev/QA aid for reproducing latency-dependent bugs (e.g. movement
    // reconciliation) - Chrome's network throttling doesn't touch a
    // WebSocket's ongoing frame traffic, only its opening handshake, and has
    // no jitter control. ?simLatency=150&simJitter=50 delays every send and
    // receive on the game socket by ~150ms +/-50ms. Absent (or 0), it's a
    // no-op, so this is safe to leave wired up in every environment.
    const simParams = new URLSearchParams(window.location.search);
    const simulatedLatencyMs = Number(simParams.get("simLatency")) || 0;
    const simulatedJitterMs = Number(simParams.get("simJitter")) || 0;

    const conn = new GameConnection({
      gameServerUrl,
      instanceId,
      slotId,
      slotToken,
      simulatedLatencyMs,
      simulatedJitterMs,
      onOpen: () => { setDisconnected(false); addLog("Connected to game server."); },
      onClose: () => {
        if (leavingRef.current) return;
        setDisconnected(true);
        addLog("Disconnected.");
      },
      onServerMessage: (msg) => {
        const visit = visitedMessageKey(msg);
        if (visit) setVisited((current) => (current.has(visit) ? current : new Set([...current, visit])));
        const questAction = questMessageAction(msg, questDefinitionsRef.current);
        if (questAction?.type === "offers") {
          questOffersRef.current = questAction.offers;
          setQuestOffers(questAction.offers);
        }
        if (["upsert", "progress", "remove"].includes(questAction?.type)) {
          if (pendingQuestActionsRef.current) pendingQuestActionsRef.current.push(questAction);
          else setActiveQuests((current) => applyQuestAction(current, questAction));
        }
        if (questAction?.log) addLog(questAction.log);
        const action = worldMessageAction(msg);
        if (!action) return;
        if (action.log) addLog(action.log);
        if (action.type === "expiring") setExpiresAt(action.expiresAt);
        if (action.type === "leave" && worldReturnUrl) {
          leavingRef.current = true;
          redirectTo(worldReturnUrl);
        }
      },
      onStateChange: ({ units: u, ncus: n = {}, combatEvents = [], lootEvents = [], lootFailures = [], ...rest }) => {
        if ("expiresAt" in rest) setExpiresAt(rest.expiresAt);
        unitsRef.current = u;
        setUnits(u);
        ncusRef.current = n;
        setNcus(n);
        const selfForHeartbeat = Object.values(u).find(un => un.zone_unit_identifier === selfIdentifierRef.current);
        const heartbeatSeq = selfForHeartbeat?.last_heartbeat_seq;
        if (heartbeatSeq != null && heartbeatSeq !== lastHeartbeatSeqRef.current) {
          lastHeartbeatSeqRef.current = heartbeatSeq;
          const rtt = connRef.current?.rttForSeq(heartbeatSeq);
          if (rtt != null) {
            const now = Date.now();
            // The displayed number updates at most every 2s - constantly
            // ticking it (every heartbeat, ~300ms) reads as distracting
            // flicker rather than a useful reading. The auto-show decision
            // below still uses every sample, just the visible text is throttled.
            if (now - lastLatencyDisplayAtRef.current >= 2000) {
              lastLatencyDisplayAtRef.current = now;
              setLatencyMs(rtt);
            }
            const hist = rttHistoryRef.current.filter((e) => now - e.t <= 10000);
            hist.push({ t: now, rtt });
            rttHistoryRef.current = hist;
            const rawAuto = shouldAutoShowLatency(hist, now);
            const { visible: auto, since } = stickyAutoShow(rawAuto, autoShowSinceRef.current, now);
            autoShowSinceRef.current = since;
            autoShowLatencyRef.current = auto;
            setAutoShowLatency(auto);
          }
        }
        const tgt = targetIdRef.current ? u[targetIdRef.current] : null;
        if (tgt) {
          const self = Object.values(u).find(un => un.zone_unit_identifier === selfIdentifierRef.current);
          if (!canTargetUnit(self, tgt)) {
            targetIdRef.current = null;
            setTargetId(null);
            connRef.current?.send({ direction: "up", type: "target", target_id: null });
          }
        }
        for (const ev of lootEvents) {
          addLog(`Lootable: ${ev.items.map(i => i.name).join(", ")} — right-click to open`);
        }
        const selfUnitId = Object.keys(u).find(id => u[id].zone_unit_identifier === selfIdentifierRef.current);
        for (const message of lootFailureMessages(lootFailures, selfUnitId)) {
          addLog(message);
        }
        for (const ev of combatEvents) {
          const attacker = u[ev.attacker_id];
          const target = u[ev.target_id];
          if (!attacker || !target) continue;
          const isBasicAttack = ev.power_name === "Basic Attack";
          // Our own basic attacks are already played optimistically by the
          // swing loop when we send the command - don't replay them a tick
          // or two later once the server confirms.
          if (isBasicAttack && attacker.zone_unit_identifier === selfIdentifierRef.current) continue;
          const attackerIsRanged = (npcBasicAttackRangeByZoneIdRef.current[attacker.zone_unit_identifier] ?? BASIC_ATTACK_RANGE) > BASIC_ATTACK_RANGE;
          const attackerIsMagic = npcBasicAttackSchoolByZoneIdRef.current[attacker.zone_unit_identifier] === "magic";
          // basicAttackStyle is opt-in per unit_type; unset falls back to the
          // same physical-melee/physical-ranged/magic split used before it
          // existed, so existing content's visuals/audio don't change.
          const attackerStyle = npcBasicAttackStyleByZoneIdRef.current[attacker.zone_unit_identifier]
            ?? (attackerIsMagic ? "arcane" : (attackerIsRanged ? "arrow" : "sword"));
          const npcBasicAttackPower = NPC_BASIC_ATTACK_STYLE_POWERS[attackerStyle] ?? NPC_BASIC_ATTACK_POWER;
          const power = isBasicAttack
            ? (attacker.hostility ? npcBasicAttackPower : CHARACTER_BASIC_ATTACK_POWER)
            : npcPowersByZoneIdRef.current[attacker.zone_unit_identifier]?.[ev.power_name];
          if (!power || (!power.graphicEffects?.length && !power.soundEffects?.length)) continue;
          firePowerEffects(power, {
            positions: isBasicAttack
              ? { self: { ...attacker.position, radius: attacker.radius }, target: { ...target.position, radius: target.radius }, selfId: ev.attacker_id, targetId: ev.target_id }
              : { self: attacker.position, target: target.position, selfId: ev.attacker_id, targetId: ev.target_id },
            baseUrl: isBasicAttack ? window.location.origin : zoneSourceUrl,
            sceneManager: canvasRef.current,
            stockAssets,
          });
        }
      },
    });
    conn.connect();
    connRef.current = conn;
    return () => conn.close();
  }, []);

  const statusCatalog = useMemo(
    () => mergeStatusCatalogs(npcStatusCatalog, buildStatusCatalog(powers, classConfigUrl)),
    [npcStatusCatalog, powers, classConfigUrl]
  );

  const selfIdentifier = `player:${characterName}`;
  const selfEntry = Object.entries(units).find(([, u]) => u.zone_unit_identifier === selfIdentifier);
  const selfUnit = selfEntry?.[1];
  const selfUnitId = selfEntry?.[0];

  const localElvl = selfUnit ? mapElvls[selfUnit.map_identifier] : undefined;
  const targetUnit = targetId ? units[targetId] : null;

  function activeStatusesFor(unit) {
    return (unit?.active_status_effects ?? [])
      .map((e) => {
        const status = statusCatalog[e.status_name]?.status;
        if (status?.treatAs !== "buff" && status?.treatAs !== "debuff") return null;
        const applier = units[e.applier_id];
        return {
          key: `${e.status_name}:${e.applier_id}`,
          shortName: status.shortName,
          treatAs: status.treatAs,
          expiresAt: e.expires_at,
          name: status.name,
          description: status.description,
          appliedByName: applier ? formatUnitName(applier) : null,
        };
      })
      .filter(Boolean);
  }
  const debugStatusCount = Number(new URLSearchParams(window.location.search).get("debugStatuses")) || 0;
  const debugStatuses = debugStatusCount > 0 ? buildDebugStatuses(debugStatusCount, Date.now()) : [];
  const selfStatuses = [...activeStatusesFor(selfUnit), ...debugStatuses];
  const targetStatuses = [...activeStatusesFor(targetUnit), ...debugStatuses];

  // Ticks re-renders once a second (only while there's something to count
  // down) so the status bars' MM:SS stays live between server updates.
  const [, setStatusTick] = useState(0);
  const hasActiveStatuses = selfStatuses.length > 0 || targetStatuses.length > 0;
  useEffect(() => {
    if (!hasActiveStatuses) return;
    const id = setInterval(() => setStatusTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [hasActiveStatuses]);

  useEffect(() => {
    setAttacking(!!selfUnit?.attacking);
  }, [selfUnit?.attacking]);

  const initialFacingSetRef = useRef(false);
  useEffect(() => {
    if (selfUnit && !initialFacingSetRef.current) {
      facingRef.current = ((selfUnit.position.angle % 360) + 360) % 360;
      initialFacingSetRef.current = true;
    }
  }, [selfUnit?.zone_unit_identifier]);

  // Reconcile local GCD to the server's authoritative value when a power
  // actually fires. The server's epoch ms is ~100ms later than our optimistic
  // estimate (network latency) so this also corrects the timing slightly.
  // If the server rejected the command (no delta update), local GCD expires
  // naturally — client-side checks in usePower prevent most false-positive sets.
  useEffect(() => {
    const serverMs = selfUnit?.global_cooldown_ends_at;
    if (serverMs) setGcd(serverMs);
  }, [selfUnit?.global_cooldown_ends_at]);

  // Reconcile the local basic-attack swing timer to the server's authoritative
  // value once it confirms a swing landed.
  useEffect(() => {
    const serverMs = selfUnit?.next_basic_attack_at;
    if (serverMs) nextBasicAttackAtRef.current = serverMs;
  }, [selfUnit?.next_basic_attack_at]);

  // Client-driven basic-attack swing loop: while attacking, poll on a short
  // interval and fire once the local swing timer is up and the target is
  // alive, in range, and in line of sight. The server independently enforces
  // all of these, so a send that fails one of them is simply dropped - this
  // mirror just avoids playing the graphic/sound for a swing that won't land.
  useEffect(() => {
    if (!attacking) return;
    const id = setInterval(() => {
      if (Date.now() < nextBasicAttackAtRef.current) return;
      const tId = targetIdRef.current;
      const target = tId ? unitsRef.current[tId] : null;
      if (!target || isUntargetableStatus(target.status)) return;
      const self = selfPosRef.current;
      const selfRadius = selfUnit?.radius ?? 0;
      if (self) {
        const dx = target.position.x - self.x;
        const dy = target.position.y - self.y;
        if (Math.sqrt(dx * dx + dy * dy) > BASIC_ATTACK_RANGE + selfRadius + (target.radius ?? 0)) return;
        const barriers = mapBarriersByIdRef.current[selfUnit?.map_identifier] ?? [];
        if (!hasLineOfSight(self.x, self.y, target.position.x, target.position.y, barriers)) return;
      }
      connRef.current?.send({ direction: "up", type: "basic_attack" });
      nextBasicAttackAtRef.current = Date.now() + BASIC_ATTACK_INTERVAL_MS;
      // Play immediately rather than waiting for the server's combat event a
      // tick or two later.
      firePowerEffects(CHARACTER_BASIC_ATTACK_POWER, {
        positions: { self: { ...self, radius: selfRadius }, target: { ...target.position, radius: target.radius }, selfId: selfUnitId, targetId: tId },
        baseUrl: window.location.origin,
        sceneManager: canvasRef.current,
        stockAssets,
      });
    }, 150);
    return () => clearInterval(id);
  }, [attacking, selfUnit?.radius]);

  const [deathTime, setDeathTime] = useState(null);
  const prevSelfStatusRef = useRef(null);
  useEffect(() => {
    const status = selfUnit?.status ?? null;
    if (status === "dead" && prevSelfStatusRef.current !== "dead") setDeathTime(Date.now());
    if (status !== "dead" && prevSelfStatusRef.current === "dead") setDeathTime(null);
    prevSelfStatusRef.current = status;
  }, [selfUnit?.status]);

  const handleRespawn = useCallback(() => {
    connRef.current?.send({ type: "respawn" });
  }, []);

  const handleUnitRightClick = useCallback((id) => {
    const selfEntry = Object.entries(unitsRef.current).find(([, u]) => u.zone_unit_identifier === selfIdentifierRef.current);
    const selfId = selfEntry?.[0];
    const unit = unitsRef.current[id];
    if (unitHasLootClaim(unit?.loot_items, selfId)) {
      setLootWindowUnitId(id);
      return;
    }
    if (unit?.hostility === "hostile" && canTargetUnit(selfEntry?.[1], unit)) {
      handleTargetUnit(id);
      handleStartAttacking();
    }
  }, [handleTargetUnit, handleStartAttacking]);

  const handleNcuRightClick = useCallback((id) => {
    const self = Object.values(unitsRef.current).find(u => u.zone_unit_identifier === selfIdentifierRef.current);
    const ncu = ncusRef.current[id];
    const dialogue = ncu && canvasRef.current?.ncuInfo(ncu.zone_ncu_identifier)?.dialogue;
    const hasOffers = !!ncu && (questOffersRef.current[ncu.zone_ncu_identifier]?.length > 0 ||
      turnInsFor(activeQuestsRef.current, ncu.zone_ncu_identifier, zoneIdentifier, {}).length > 0);
    if (!canTalkTo(self, ncu, dialogue, hasOffers)) return;
    setDialogueNcuId(id);
    connRef.current?.send({ type: "talk", ncu_id: id });
  }, [zoneIdentifier]);

  // Right-clicking an available interactable (the scene only picks those)
  // in range uses it; the game server checks again.
  const handleInteractableRightClick = useCallback((identifier) => {
    const self = Object.values(unitsRef.current).find(u => u.zone_unit_identifier === selfIdentifierRef.current);
    const info = canvasRef.current?.interactableInfo(identifier);
    if (!self || !info || info.map !== self.map_identifier || !inUseRange(self.position, self.radius ?? 0, info)) return;
    connRef.current?.send({ type: "use_interactable", interactable: identifier });
  }, []);

  const handleAbandonQuest = useCallback((quest) => {
    connRef.current?.send({ type: "abandon_quest", quest });
  }, []);

  const handleAcceptQuest = useCallback((quest) => {
    if (dialogueNcuId) connRef.current?.send({ type: "accept_quest", ncu_id: dialogueNcuId, quest });
  }, [dialogueNcuId]);

  const handleTurnInQuest = useCallback((quest) => {
    if (dialogueNcuId) connRef.current?.send({ type: "turn_in_quest", ncu_id: dialogueNcuId, quest });
  }, [dialogueNcuId]);

  // Frees the slot through Rails (which closes our socket, so onClose is
  // muted while leaving), then goes to the world's page.
  const handleLeaveWorld = useCallback(async () => {
    setMenuOpen(false);
    leavingRef.current = true;
    const { redirectUrl, error } = await leaveWorld(leaveWorldUrl);
    if (redirectUrl) {
      redirectTo(redirectUrl);
      return;
    }
    leavingRef.current = false;
    addLog(error);
  }, [leaveWorldUrl]);

  const handleTakeItem = useCallback((targetUnitId, itemIndex) => {
    connRef.current?.send({ type: "loot_item", target_unit_id: targetUnitId, item_index: itemIndex });
  }, []);

  // Equips characterItem into equippedSlot via the Rails play API, then tells
  // the game server to refetch equipped items from Rails. Returns null on
  // success or an error message string on failure.
  const handleEquipItem = useCallback(async (equippedSlot, characterItem) => {
    if (!equippedItemsUrl) return "Equip endpoint unavailable.";
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    try {
      const res = await fetch(`${equippedItemsUrl}/${equippedSlot}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
        },
        credentials: "same-origin",
        body: JSON.stringify({ character_item_id: characterItem?.id ?? "" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        return body?.error || "Failed to equip item.";
      }
      setEquippedItems(await res.json());
      connRef.current?.send({ type: "refresh_equipment" });
      return null;
    } catch {
      return "Failed to equip item.";
    }
  }, [equippedItemsUrl]);

  const [gearPromptDismissed, setGearPromptDismissed] = useState(false);
  const [gearSwitching, setGearSwitching] = useState(false);
  const [gearError, setGearError] = useState(null);

  // Equips the best allowed gear in every slot (EquipBestAvailable), then
  // tells the game server to refetch. Returns null on success or an error.
  const handleBestAvailable = useCallback(async () => {
    if (!equippedItemsUrl) return "Equip endpoint unavailable.";
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    try {
      const res = await fetch(`${equippedItemsUrl}/best_available`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
        },
        credentials: "same-origin",
        body: JSON.stringify({ restrictions: JSON.stringify(provenanceRestrictions?.layers ?? []) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        return body?.error || "Failed to switch gear.";
      }
      setEquippedItems(await res.json());
      connRef.current?.send({ type: "refresh_equipment" });
      return null;
    } catch {
      return "Failed to switch gear.";
    }
  }, [equippedItemsUrl, provenanceRestrictions]);

  const handleGearPromptSwitch = useCallback(async () => {
    setGearSwitching(true);
    setGearError(null);
    const error = await handleBestAvailable();
    setGearSwitching(false);
    if (error) setGearError(error);
  }, [handleBestAvailable]);

  const disallowedEquipped = useMemo(
    () => (gearPromptDismissed ? [] : disallowedItems(equippedItems, provenanceRestrictions)),
    [gearPromptDismissed, equippedItems, provenanceRestrictions]
  );

  const targetRange = (selfUnit && targetUnit)
    ? Math.sqrt(
        (targetUnit.position.x - selfUnit.position.x) ** 2 +
        (targetUnit.position.y - selfUnit.position.y) ** 2
      ).toFixed(1)
    : null;
  // Self's comes from characterTokenUrl (a prop), another player's from
  // their unit (token_image_url), and an NPC's from the zone config
  // (npcTokenUrlByZoneIdRef).
  const targetTokenUrl = targetUnit
    ? (targetUnit.zone_unit_identifier === selfIdentifier
        ? characterTokenUrl
        : (targetUnit.token_image_url ?? npcTokenUrlByZoneIdRef.current[targetUnit.zone_unit_identifier] ?? null))
    : null;
  // Unlike token art, another player's resource
  // name/color isn't known client-side, so their resource bar/meter just
  // falls back to ResourceBar's own default gray and no meter label.
  const targetResource = targetUnit
    ? (targetUnit.zone_unit_identifier === selfIdentifier
        ? primaryResource
        : npcResourceByZoneIdRef.current[targetUnit.zone_unit_identifier])
    : null;
  // Secondary (e.g. combo points) resources are class-only - units never
  // have one, and another player's class isn't known client-side - so this
  // is only ever non-empty when the target happens to be self.
  const targetSecondaryResources = targetUnit?.zone_unit_identifier === selfIdentifier ? secondaryResources : [];

  overlayOpenRef.current = lootWindowUnitId != null || dialogueNcuId != null || charSheetOpen || questLogOpen || atlasOpen || classOpen || settingsOpen || menuOpen;

  // Walking away (or dying) ends the conversation.
  const dialogueNcu = dialogueNcuId ? ncus[dialogueNcuId] : null;
  const dialogueStillOpen = canKeepTalking(selfUnit, dialogueNcu);
  useEffect(() => {
    if (dialogueNcuId && !dialogueStillOpen) setDialogueNcuId(null);
  }, [dialogueNcuId, dialogueStillOpen]);
  const dialogueInfo = dialogueNcu ? canvasRef.current?.ncuInfo(dialogueNcu.zone_ncu_identifier) : null;
  const latencyVisible = isLatencyVisible(latencyOverride, autoShowLatency);

  // stacked (portrait and landscape both use this now): bar+name header
  // spans the full container width at the top, token image below it -
  // instead of desktop's boxed image-beside-bars layout. `portrait` swaps
  // in the smaller, wrapping-name variant (frameImagePortraitHud/
  // frameNamePortraitHud) - portrait's frame pane is wide but the token
  // is scaled way down, so the name needs to wrap instead of truncate.
  function renderSelfFrameContent(stacked, portrait) {
    if (stacked) {
      return (
        <>
          <div className="game-frame-hud-header">
            {selfUnit && <HealthBar current={selfUnit.health} max={selfUnit.max_health} landscape />}
            {selfUnit && (
              <UnitResourceBars unit={selfUnit} primaryResource={primaryResource} secondaryResources={secondaryResources} landscape />
            )}
          </div>
          <div className="game-frame-image-name-row">
            {characterTokenUrl && <img src={characterTokenUrl} alt="" className={portrait ? "game-frame-image-portrait-hud" : "game-frame-image-adaptive-hud"} />}
            <div className={portrait ? "game-frame-name-portrait-hud" : "game-frame-name-inline"}>{characterName ?? "—"}</div>
          </div>
          {selfUnit?.status === "dead" && <span className="game-dead-badge">DEAD</span>}
        </>
      );
    }
    return (
      <>
        {characterTokenUrl && <img src={characterTokenUrl} alt="" className="game-frame-image" />}
        <div className="game-frame-info">
          <strong>{characterName ?? "—"}</strong>
          {selfUnit && (
            <div className="game-health-resource-stack">
              <HealthBar
                current={selfUnit.health} max={selfUnit.max_health} numbersAlign="end"
                resourceLabel={resourceMeterLabel(primaryResource, resourceCurrent(selfUnit, primaryResource?.name), resourceMax(selfUnit, primaryResource?.name))}
              />
              <UnitResourceBars unit={selfUnit} primaryResource={primaryResource} secondaryResources={secondaryResources} />
            </div>
          )}
          {selfUnit?.status === "dead" && <span className="game-dead-badge">DEAD</span>}
        </div>
      </>
    );
  }

  function renderTargetFrameContent(stacked, portrait) {
    if (!targetUnit) return <span className="game-no-target">No target</span>;
    const targetPrimaryCurrent = resourceCurrent(targetUnit, targetResource?.name);
    const targetPrimaryMax = resourceMax(targetUnit, targetResource?.name);
    if (stacked) {

      return (
        <>
          <div className="game-frame-hud-header">
            <HealthBar current={targetUnit.health} max={targetUnit.max_health} landscape mirrored />
            <UnitResourceBars
              unit={targetUnit} primaryResource={targetResource} secondaryResources={targetSecondaryResources} landscape
            />
            <CastBar unit={targetUnit} inline />
          </div>
          <div className="game-frame-image-name-row-right">
            {targetTokenUrl && <img src={targetTokenUrl} alt="" className={portrait ? "game-frame-image-portrait-hud" : "game-frame-image-adaptive-hud"} />}
            <div className={portrait ? "game-frame-name-portrait-hud" : "game-frame-name-inline"} style={{ color: targetRelationshipColors(targetUnit).text }}>
              {formatUnitName(targetUnit)}
            </div>
          </div>
          {targetUnit.status === "dead" && <span className="game-dead-badge">DEAD</span>}
          {targetUnit.status === "respawning" && <span className="game-dead-badge">RESPAWNING</span>}
          {targetUnit.status === "leashing" && <span className="game-dead-badge">EVADING</span>}
        </>
      );
    }
    return (
      <>
        {targetTokenUrl && <img src={targetTokenUrl} alt="" className="game-frame-image" />}
        <div className="game-frame-info">
          <strong>{formatUnitName(targetUnit)}</strong>
          {targetRange != null && <span className="game-target-range">{targetRange} ft</span>}
          <div className="game-health-resource-stack">
            <HealthBar
              current={targetUnit.health} max={targetUnit.max_health} numbersAlign="start"
              resourceLabel={resourceMeterLabel(targetResource, targetPrimaryCurrent, targetPrimaryMax)}
            />
            <UnitResourceBars unit={targetUnit} primaryResource={targetResource} secondaryResources={targetSecondaryResources} />
            <CastBar unit={targetUnit} inline />
          </div>
          {targetUnit.status === "dead" && <span className="game-dead-badge">DEAD</span>}
          {targetUnit.status === "respawning" && <span className="game-dead-badge">RESPAWNING</span>}
          {targetUnit.status === "leashing" && <span className="game-dead-badge">EVADING</span>}
        </div>
      </>
    );
  }

  function renderActionSlot(button, extraClass, sizeStyle) {
    const slot = button + 1;
    const key = bindingLabel(hotkeys[`ability_${slot}`]);
    const i = buttonLayout[button]; // power index shown on this button
    const power = powers[i];
    const iconUrl = power?.iconURL
      ? (resolveStockAssetUrl(power.iconURL, "icons", stockAssets) ?? new URL(power.iconURL, classConfigUrl).href)
      : null;
    let inRange = true;
    let isFacing = true;
    if (power && targetUnit && selfUnit) {
      const range = powerMaxRange(power);
      if (range != null) {
        const dx = targetUnit.position.x - selfUnit.position.x;
        const dy = targetUnit.position.y - selfUnit.position.y;
        inRange = Math.sqrt(dx * dx + dy * dy) <= range + (selfUnit.radius ?? 0) + (targetUnit.radius ?? 0);
        if (power.frontal !== false) {
          const toTarget = Math.atan2(dx, dy) * 180 / Math.PI;
          let diff = toTarget - selfUnit.position.angle;
          while (diff > 180) diff -= 360;
          while (diff < -180) diff += 360;
          isFacing = Math.abs(diff) <= 75;
        }
      }
    }
    const affordable = !power || !(power.costAmount > 0) || (selfUnit?.resources?.[power.costType]?.current ?? 0) >= power.costAmount;
    const now = Date.now();
    const pcEndsAt = power?.name ? (selfUnit?.power_cooldowns?.[power.name] ?? 0) : 0;
    // Show whichever cooldown ends later; GCD total is used when GCD is dominant.
    const cdEndsAt = Math.max(gcdEndsAt, pcEndsAt);
    const onCooldown = power && cdEndsAt > now;
    const remainingMs = onCooldown ? cdEndsAt - now : 0;
    const usingGcd = gcdEndsAt >= pcEndsAt;
    const totalMs = usingGcd ? (gcdTotalMsRef.current || 1) : (power?.cooldown ?? 1) * 1000;
    const fraction = onCooldown ? remainingMs / totalMs : 0;
    const revealedDeg = (1 - fraction) * 360;
    const cdSecs = (onCooldown && totalMs > 2000) ? Math.ceil(remainingMs / 1000) : null;

    // extraClass also goes on the tooltip's own wrapper (not just the inner
    // button div) - it's the wrapper that's actually the flex item in a
    // flex row (e.g. game-portrait-action-row), so sizing like flex:1 has to be
    // set there or it's a no-op. sizeStyle (the landscape grid's fitted
    // size) goes on both, the same way.
    return (
      <AbilityTooltip key={slot} ability={power} className={extraClass} style={sizeStyle}>
        <div
          className={["game-action-button", extraClass, flashSlot === i && "game-action-button-flash"].filter(Boolean).join(" ")}
          style={{ ...sizeStyle, cursor: power ? "pointer" : "default", opacity: (inRange && isFacing && affordable) ? 1 : 0.3 }}
          onClick={power ? () => usePower(i) : undefined}
        >
          {iconUrl && <IconImage src={iconUrl} color={power.iconColor} alt={power.name} className="game-action-icon"/>}
          {onCooldown && (
            <div className="game-action-cooldown-sweep" style={{
              background: `conic-gradient(from -90deg, transparent ${revealedDeg}deg, rgba(0,0,0,0.65) ${revealedDeg}deg)`,
            }}/>
          )}
          {cdSecs && (
            <div className="game-action-cooldown-overlay">
              <span className="game-action-cooldown-text">{cdSecs}</span>
            </div>
          )}
          <span className="game-action-keybind">{key}</span>
        </div>
      </AbilityTooltip>
    );
  }

  const sceneContent = (
    <>
      <Canvas
        ref={canvasRef}
        zoneSourceUrl={zoneSourceUrl}
        zoneSourceSha={zoneSourceSha}
        units={units}
        ncus={ncus}
        questNcus={questNcuSet}
        selfIdentifier={selfIdentifier}
        characterTokenUrl={characterTokenUrl}
        movementKeysRef={movementKeysRef}
        turnKeysRef={turnKeysRef}
        cameraStickRef={cameraStickRef}
        cameraSensitivityRef={cameraSensitivityRef}
        onFacingChange={handleFacingChange}
        onCanvasResize={setCanvasRect}
        onSelfPosition={handleSelfPosition}
        positionForMoveSeq={positionForMoveSeq}
        onUnitClick={handleTargetUnit}
        onUnitRightClick={handleUnitRightClick}
        onUnitHover={setHoveredUnitId}
        onNcuRightClick={handleNcuRightClick}
        onInteractableRightClick={handleInteractableRightClick}
        activeQuests={activeQuests}
        zoneIdentifier={zoneIdentifier}
        lootableUnitIds={new Set(Object.entries(units).filter(([, u]) => u.loot_items?.some(i => i.claims?.find(c => c.character_unit_id === selfUnitId)?.state === "available")).map(([id]) => id))}
        targetId={targetId}
        attacking={attacking}
        statusCatalog={statusCatalog}
        stockAssets={stockAssets}
      />
      {/* landscape prop: the compact/stacked treatment now applies to both
          phone orientations, not just landscape - portrait's full-width
          canvas band still doesn't have room for buffs/debuffs side by
          side with mm:ss timers once the frame/controls bands take their
          share too. */}
      <StatusBar statuses={selfStatuses} now={Date.now()} side="left" landscape={viewportMode.isPhoneLayout} />
      <StatusBar statuses={targetStatuses} now={Date.now()} side="right" landscape={viewportMode.isPhoneLayout} />
      <CastBar unit={selfUnit} position="bottom" />
      {abilityError && <AbilityErrorBanner key={abilityError.key} message={abilityError.message} onDone={clearAbilityError} />}
      <UnitTooltip unit={hoveredUnitId ? units[hoveredUnitId] : null} selfUnitId={selfUnitId} />
      <RespawnOverlay deathTime={deathTime} onRespawn={handleRespawn} />
      {dialogueNcu && (
        <DialogueWindow
          key={dialogueNcuId}
          name={dialogueInfo?.name ?? dialogueNcu.zone_ncu_identifier}
          dialogue={dialogueInfo?.dialogue}
          offers={offersFor(questOffers, dialogueNcu.zone_ncu_identifier, questDefinitions)}
          turnIns={turnInsFor(activeQuests, dialogueNcu.zone_ncu_identifier, zoneIdentifier, questDefinitions)}
          onAcceptQuest={handleAcceptQuest}
          onTurnInQuest={handleTurnInQuest}
          onClose={() => setDialogueNcuId(null)}
        />
      )}
      <LootWindow
        unitId={lootWindowUnitId}
        unitName={formatUnitName(units[lootWindowUnitId])}
        items={units[lootWindowUnitId]?.loot_items}
        selfUnitId={selfUnitId}
        onTake={handleTakeItem}
        onClose={() => setLootWindowUnitId(null)}
        localElvl={localElvl}
      />
      <SettingsDialog
        open={settingsOpen}
        powers={powers}
        layout={buttonLayout}
        onAssign={(button, power) => updateButtonLayout(assignPowerToButton(buttonLayout, button, power))}
        onReset={() => updateButtonLayout(resolveButtonLayout(null))}
        onToggleLatency={() => {
          setLatencyOverride((current) => nextLatencyOverride(current, autoShowLatencyRef.current));
          setSettingsOpen(false);
        }}
        onReload={() => window.location.reload()}
        hotkeys={hotkeys}
        onSaveHotkeys={saveHotkeys}
        showHotkeys={!viewportMode.isPhoneLayout}
        cameraSensitivity={cameraSensitivity}
        onCameraSensitivityChange={updateCameraSensitivity}
        onClose={() => setSettingsOpen(false)}
        error={settingsError}
      />
      <CharacterSheet
        open={charSheetOpen}
        equippedItems={equippedItems}
        combatStats={selfUnit?.combat_stats}
        characterItemsUrl={characterItemsUrl}
        onEquip={handleEquipItem}
        onBestAvailable={handleBestAvailable}
        provenanceRestrictions={provenanceRestrictions}
        onClose={() => setCharSheetOpen(false)}
        localElvl={localElvl}
        primaryStats={primaryStats}
        portrait={viewportMode.isPortraitPhone}
        landscape={viewportMode.isLandscapePhone}
      />
      <QuestLog
        open={questLogOpen}
        zones={questZones}
        currentZone={zoneIdentifier}
        currentNames={currentZoneNames}
        zonesUrl={activeQuestsUrl && `${activeQuestsUrl}/zones`}
        onAbandon={handleAbandonQuest}
        onClose={() => setQuestLogOpen(false)}
        portrait={viewportMode.isPortraitPhone}
        landscape={viewportMode.isLandscapePhone}
      />
      <AtlasWindow
        open={atlasOpen}
        atlas={atlas}
        visited={visited}
        zone={zoneIdentifier}
        map={selfUnit?.map_identifier}
        position={selfUnit?.position}
        onClose={() => setAtlasOpen(false)}
        portrait={viewportMode.isPortraitPhone}
        landscape={viewportMode.isLandscapePhone}
      />
      <ClassSheet
        open={classOpen}
        powers={powers}
        className={classInfo.name}
        classDescription={classInfo.description}
        combatStats={selfUnit?.combat_stats}
        classConfigUrl={classConfigUrl}
        stockAssets={stockAssets}
        onClose={() => setClassOpen(false)}
        portrait={viewportMode.isPortraitPhone}
        landscape={viewportMode.isLandscapePhone}
      />
      {/* Menu dialog: shared by both phone orientations (only the trigger
          button's position/look differs - see chatButtonLandscape/
          menuButtonLandscape for landscape's absolute corner buttons vs.
          the portrait bottom band's static ones). Chat's log panel is
          NOT here - landscape's covers just the scene panel (rendered
          below, inside canvasWrapper), while portrait's covers the top
          two-thirds of the whole screen (rendered in portraitColumn) - two
          different positioned ancestors, so each needs its own instance. */}
      {viewportMode.isLandscapePhone && chatOpen && (
        <div className="game-chat-panel-landscape">
          {log.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}
      {viewportMode.isPhoneLayout && menuOpen && (
        <div className="game-menu-dialog-landscape">
          <button
            className="game-menu-dialog-button"
            onClick={() => { setCharSheetOpen((o) => !o); setMenuOpen(false); }}
          >
            Character
          </button>
          <button
            className="game-menu-dialog-button"
            onClick={() => { setQuestLogOpen((o) => !o); setMenuOpen(false); }}
          >
            Quests
          </button>
          {atlas && (
            <button
              className="game-menu-dialog-button"
              onClick={() => { setAtlasOpen((o) => !o); setMenuOpen(false); }}
            >
              Map
            </button>
          )}
          <button
            className="game-menu-dialog-button"
            onClick={() => { setClassOpen((o) => !o); setMenuOpen(false); }}
          >
            Class
          </button>
          <button
            className="game-menu-dialog-button"
            onClick={() => { setSettingsOpen(true); setMenuOpen(false); }}
          >
            Settings
          </button>
          {leaveWorldUrl && (
            <button className="game-menu-dialog-button" onClick={handleLeaveWorld}>
              Leave world
            </button>
          )}
          {!leaveWorldUrl && exitUrl && (
            <button className="game-menu-dialog-button" onClick={() => redirectTo(exitUrl)}>
              Leave zone
            </button>
          )}
        </div>
      )}
    </>
  );

  return (
    <div
      className="game-root"
      data-touch={viewportMode.isTouch || undefined}
      data-phone-layout={viewportMode.isPhoneLayout || undefined}
      data-orientation={viewportMode.isPhoneLayout ? (viewportMode.isPortraitPhone ? "portrait" : "landscape") : undefined}
    >
      {new URLSearchParams(window.location.search).has("debugViewport") && (
        <div className="game-viewport-debug">
          touch={String(viewportMode.isTouch)} phone={String(viewportMode.isPhoneLayout)}{" "}
          {viewportMode.isPhoneLayout && (viewportMode.isPortraitPhone ? "portrait" : "landscape")}
        </div>
      )}
      {latencyVisible && (
        <div className="game-latency" style={{ top: viewportMode.isPortraitPhone ? (canvasRect?.bottom ?? 98) + 8 : 98 }}>
          <HintTooltip text="Hit 'L' to toggle">
            <div className="game-latency-badge" style={{ color: latencyColor(latencyMs) }}>
              {latencyMs != null ? `RTT Latency: ${latencyMs} ms` : "RTT Latency: —"}
            </div>
          </HintTooltip>
        </div>
      )}
      {viewportMode.isLandscapePhone ? (
        <div className="game-landscape-row">
          <div className="game-landscape-control-panel" style={{ minWidth: LANDSCAPE_PANEL_MIN_WIDTH, padding: LANDSCAPE_PANEL_PADDING }}>
            <div className="game-landscape-frame-slot">
              <div className="game-frame-in-panel-hud">
                {renderSelfFrameContent(true)}
              </div>
            </div>
            <div className="game-landscape-controls-slot game-landscape-controls-slot-left">
              <div className="game-landscape-touch-controls-row">
                <button
                  className="game-touch-control-button-landscape"
                  title="Tab-target (Tab)"
                  onClick={() => handleTabTarget(unitsRef.current, targetIdRef.current, selfIdentifier)}
                >
                  Tab
                </button>
                <button
                  className={attacking ? "game-touch-control-button-landscape game-touch-control-button-active" : "game-touch-control-button-landscape"}
                  title="Start/stop attacking (T)"
                  onClick={() => (attacking ? handleStopAttacking() : handleStartAttacking())}
                >
                  Atk
                </button>
              </div>
            </div>
            <div className="game-landscape-joystick-slot">
              <Joystick
                onMove={handleMovementStickMove}
                onEnd={handleMovementStickEnd}
                className="game-landscape-joystick-zone"
              />
            </div>
          </div>
          <div className="game-canvas-wrapper">
            {sceneContent}
            <button
              className={chatOpen ? "game-chat-button-landscape game-chat-button-active" : "game-chat-button-landscape"}
              title="Toggle chat"
              onClick={() => setChatOpen((o) => !o)}
            >
              Chat
            </button>
            <button
              className="game-menu-button-landscape"
              title="Menu"
              onClick={() => setMenuOpen((o) => !o)}
            >
              Menu
            </button>
          </div>
          <div className="game-landscape-control-panel" style={{ minWidth: LANDSCAPE_PANEL_MIN_WIDTH, padding: LANDSCAPE_PANEL_PADDING }}>
            <div className="game-landscape-frame-slot">
              <div className="game-frame-in-panel-hud">
                {renderTargetFrameContent(true)}
              </div>
            </div>
            <div ref={actionGridPaneRef} className="game-landscape-controls-slot game-landscape-controls-slot-right">
              <div
                className="game-landscape-action-grid"
                style={actionGridLayout ? {
                  width: actionGridLayout.columns * actionGridLayout.size + (actionGridLayout.columns - 1) * 8,
                  height: actionGridLayout.rows * actionGridLayout.size + (actionGridLayout.rows - 1) * 8,
                } : undefined}
              >
                {Array.from({ length: 10 }, (_, i) => renderActionSlot(
                  i, "game-action-button-landscape",
                  actionGridLayout ? { width: actionGridLayout.size, height: actionGridLayout.size } : undefined,
                ))}
              </div>
            </div>
            <div className="game-landscape-joystick-slot">
              <Joystick
                onMove={handleCameraStickMove}
                onEnd={handleCameraStickEnd}
                className="game-landscape-joystick-zone"
                horizontal
              />
            </div>
          </div>
        </div>
      ) : viewportMode.isPortraitPhone ? (
        <div className="game-portrait-column">
          <div className="game-portrait-frame-band">
            <div className="game-portrait-frame-pane">
              <div className="game-frame-in-panel-hud">
                {renderSelfFrameContent(true, true)}
              </div>
            </div>
            <div className="game-portrait-frame-pane">
              <div className="game-frame-in-panel-hud">
                {renderTargetFrameContent(true, true)}
              </div>
            </div>
          </div>
          {/* flexShrink:0 override: if the column ever runs short on
              height, the scene should never be the one that gives up
              space - portraitControlsBand does that instead. */}
          <div className="game-canvas-wrapper game-canvas-wrapper-fixed">
            {sceneContent}
          </div>
          <div className="game-portrait-controls-band">
            <div className="game-portrait-tab-atk-row">
              <button
                className="game-touch-control-button-portrait"
                title="Tab-target (Tab)"
                onClick={() => handleTabTarget(unitsRef.current, targetIdRef.current, selfIdentifier)}
              >
                Tab
              </button>
              <button
                className={attacking ? "game-touch-control-button-portrait game-touch-control-button-active" : "game-touch-control-button-portrait"}
                title="Start/stop attacking (T)"
                onClick={() => (attacking ? handleStopAttacking() : handleStartAttacking())}
              >
                Atk
              </button>
            </div>
            {ACTION_ROWS_PORTRAIT.map((row, ri) => (
              <div key={ri} className="game-portrait-action-row">
                {row.map((i) => renderActionSlot(i, "game-action-button-portrait"))}
              </div>
            ))}
          </div>
          <div className="game-portrait-joystick-band">
            <Joystick
              onMove={handleMovementStickMove}
              onEnd={handleMovementStickEnd}
              className="game-landscape-joystick-zone"
            />
            {/* Right stick: console-style continuous camera look, symmetric with the left (movement) stick. */}
            <Joystick
              onMove={handleCameraStickMove}
              onEnd={handleCameraStickEnd}
              className="game-landscape-joystick-zone"
              horizontal
            />
          </div>
          <div className="game-portrait-bottom-buttons-band">
            <button
              className={chatOpen ? "game-bottom-band-button-portrait game-chat-button-active" : "game-bottom-band-button-portrait"}
              title="Toggle chat"
              onClick={() => setChatOpen((o) => !o)}
            >
              Chat
            </button>
            <button
              className="game-bottom-band-button-portrait"
              title="Menu"
              onClick={() => setMenuOpen((o) => !o)}
            >
              Menu
            </button>
          </div>
          {chatOpen && (
            <div className="game-chat-panel-landscape">
              {log.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="game-frames">
            <div className="game-self-frame">{renderSelfFrameContent()}</div>
            <div className="game-target-frame" style={{
              background: targetRelationshipColors(targetUnit).background,
              border: `1px solid ${targetRelationshipColors(targetUnit).borderColor}`,
            }}>{renderTargetFrameContent()}</div>
          </div>
          <div className="game-canvas-wrapper">
            {sceneContent}
          </div>
          <div className="game-action-bar">
            {Array.from({ length: 10 }, (_, i) => renderActionSlot(i))}
          </div>
        </>
      )}
      {/* Log: desktop only now - portrait rolled it into the Chat button. */}
      {!viewportMode.isPhoneLayout && (
        <div className="game-log">
          {log.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}
      {/* Char/Latency/Reload: desktop only now - both phone orientations roll these into the Menu button/dialog instead. */}
      {!viewportMode.isPhoneLayout && (
        <div className="game-utility-row">
          <button
            className="game-utility-button"
            title="Character sheet (P)"
            onClick={() => setCharSheetOpen(o => !o)}
          >
            Char
          </button>
          <button
            className="game-utility-button"
            title="Quest log (J)"
            onClick={() => setQuestLogOpen(o => !o)}
          >
            Quests
          </button>
          {atlas && (
            <button
              className="game-utility-button"
              title="Map (M)"
              onClick={() => setAtlasOpen(o => !o)}
            >
              Map
            </button>
          )}
          <button
            className="game-utility-button"
            title="Class"
            onClick={() => setClassOpen(o => !o)}
          >
            Class
          </button>
          <button
            className="game-utility-button"
            title="Settings"
            onClick={() => setSettingsOpen(true)}
          >
            Settings
          </button>
          {leaveWorldUrl && (
            <button className="game-utility-button" title="Leave world" onClick={handleLeaveWorld}>
              Leave world
            </button>
          )}
          {!leaveWorldUrl && exitUrl && (
            <button className="game-utility-button" title="Leave zone" onClick={() => redirectTo(exitUrl)}>
              Leave zone
            </button>
          )}
        </div>
      )}
      <ExpiryBanner expiresAt={expiresAt} />
      <GearRestrictionPrompt
        items={disallowedEquipped}
        busy={gearSwitching}
        error={gearError}
        onSwitch={handleGearPromptSwitch}
        onDismiss={() => setGearPromptDismissed(true)}
      />
      {contentError && <ContentErrorOverlay message={contentError} />}
      {disconnected && (
        <div className="game-disconnected">
          <div className="game-disconnected-text">
            DISCONNECTED
          </div>
        </div>
      )}
    </div>
  );
}
