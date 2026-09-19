import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const RESPAWN_DELAY_S = 10;
import Canvas from "./Canvas";
import { Joystick } from "./Joystick";
import { angleToMovementKeys } from "./joystickAngle";
import { GameConnection } from "./game/connection";
import { firePowerEffects } from "./game/effectPlayback";
import { canTargetUnit } from "./game/state";
import { hasLineOfSight } from "./game/collision";
import { buildStatusCatalog, mergeStatusCatalogs } from "./game/statusCatalog";
import { resolveStockAssetUrl } from "./resolveStockAssetUrl";
import { useViewportMode } from "./useViewportMode";
import { AbilityTooltip } from "./AbilityTooltip";
import SettingsDialog from "./SettingsDialog";
import { assignPowerToButton, layoutToMap, resolveButtonLayout, saveCharacterSettings } from "./abilityButtons";

// W/S/Q/E → movement keys sent to server; A/D → turning handled by SceneManager
const KEY_MAP = {
  KeyW: "forward",
  KeyS: "backward",
  KeyQ: "strafe_left",
  KeyE: "strafe_right",
  KeyA: "turn_left",
  KeyD: "turn_right",
};
const MOVEMENT_KEYS = new Set(["forward", "backward", "strafe_left", "strafe_right"]);
const TURN_KEYS = new Set(["turn_left", "turn_right"]);

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

const styles = {
  root: {
    display: "flex",
    flexDirection: "column",
    width: "100vw",
    // dvh (dynamic viewport height) tracks the actually-visible viewport as
    // mobile browser chrome (the URL bar) collapses/expands, unlike vh -
    // which is pinned to the viewport's largest possible size and leaves a
    // gap (or lets the URL bar cover real content) when the chrome is showing.
    height: "100dvh",
    background: "#111",
    color: "#ddd",
    fontFamily: "monospace",
    fontSize: 13,
    overflow: "hidden",
  },
  viewportDebug: {
    position: "fixed",
    top: 0,
    left: 0,
    zIndex: 2000,
    background: "rgba(0,0,0,0.7)",
    color: "#0f0",
    fontFamily: "monospace",
    fontSize: 11,
    padding: "2px 6px",
  },
  frames: {
    display: "flex",
    flexShrink: 0,
    height: 90,
  },
  selfFrame: {
    flex: 1,
    display: "flex",
    alignItems: "stretch",
    gap: 8,
    background: "#0d2b0d",
    border: "1px solid #2a6a2a",
    padding: 8,
  },
  targetFrame: {
    flex: 1,
    display: "flex",
    flexDirection: "row-reverse",
    alignItems: "stretch",
    gap: 8,
    background: "#2b0d0d",
    border: "1px solid #6a2a2a",
    padding: 8,
  },
  // Both orientations now give this a real box to fill (landscapeFrameSlot
  // for landscape, portraitFramePane for portrait) - flex/minHeight:0
  // stretch it to that box's full height so the token image
  // (frameImageAdaptiveHud/frameImagePortraitHud) has real room to scale
  // into, instead of sizing to its own fixed-pixel content. marginTop
  // cancels the container's own top offset/padding so the health bar
  // (first thing in the header) pokes up flush with the very top of the
  // screen.
  frameInPanelHud: {
    display: "flex",
    flexDirection: "column",
    background: "none",
    border: "none",
    padding: 0,
    marginTop: -8,
    flex: 1,
    minHeight: 0,
  },
  frameImage: {
    height: "100%",
    width: "auto",
    objectFit: "cover",
    borderRadius: 4,
    flexShrink: 0,
  },
  frameInfo: {
    position: "relative",
    flex: 1,
    minWidth: 0,
  },
  healthBarTrack: {
    position: "absolute",
    bottom: 6,
    left: 6,
    right: 6,
    height: 9,
    border: "1px solid #3a8a3a",
    borderRadius: 2,
    background: "#5a1010",
  },
  // Landscape phone: pinned to the top of frameInfo (which itself sits a
  // couple px from the top of the screen), twice the height/length of the
  // desktop bar (no left/right margin, full frameInfo width).
  healthBarTrackLandscape: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 18,
    // Black instead of the desktop bar's green border - green blends into
    // grass/foliage scenery now that the frame has no background box.
    border: "1px solid #000",
    borderRadius: 2,
    background: "#5a1010",
  },
  healthBarPctLandscape: {
    position: "absolute",
    top: "50%",
    right: 4,
    transform: "translateY(-50%)",
    fontSize: 12,
    fontWeight: "bold",
    color: "#fff",
    textShadow: "0 1px 2px #000",
    pointerEvents: "none",
  },
  healthBarPctLandscapeLeft: {
    position: "absolute",
    top: "50%",
    left: 4,
    transform: "translateY(-50%)",
    fontSize: 12,
    fontWeight: "bold",
    color: "#fff",
    textShadow: "0 1px 2px #000",
    pointerEvents: "none",
  },
  // Bar+name HUD (portrait and landscape both use this now): the header
  // holds just the health bar; the name moved down next to the token image
  // instead of living in this header.
  frameHudHeader: {
    position: "relative",
    height: 18,
    flexShrink: 0,
  },
  // Image + name side by side, below the header ("moved down" to clear
  // it). Row-reverse for target so the name still sits nearer the header
  // it belongs to while the image is still in the original image/name
  // reading order (matches the old row-reverse targetFrame convention for
  // the same reason). flex/minHeight:0 let this fill whatever height
  // frameInPanelHud has to give it (see frameInPanelHud).
  frameImageNameRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
    flex: 1,
    minHeight: 0,
  },
  frameImageNameRowRight: {
    display: "flex",
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
    flex: 1,
    minHeight: 0,
  },
  // Landscape: scales with the frame's box instead of a fixed pixel height
  // - fills whatever vertical room frameImageNameRow actually has (see
  // landscapeFrameSlot), capped by maxWidth so a wide/tall aspect ratio
  // can't push the name out or bleed past the panel's width.
  frameImageAdaptiveHud: {
    height: "100%",
    width: "auto",
    maxWidth: "65%",
    objectFit: "cover",
    borderRadius: 4,
    flexShrink: 0,
    minHeight: 0,
  },
  // Portrait: tripled back up from an initial 40% (100%/2.5) after that
  // read as too small once the frame band itself also got shrunk - maxWidth
  // loosened to match (the row is nearly full screen width, so this isn't
  // a meaningful cap at this scale, just a backstop against true overflow).
  frameImagePortraitHud: {
    height: "120%",
    width: "auto",
    maxWidth: "100%",
    objectFit: "cover",
    borderRadius: 4,
    flexShrink: 0,
    minHeight: 0,
  },
  frameNameInline: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#eee",
    textShadow: "0 1px 2px #000",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    minWidth: 0,
  },
  // Portrait: wraps instead of truncating - the name breaks at whitespace
  // (normal word-wrap) and only breaks mid-word (overflowWrap) if a single
  // word is too long to fit at all. Smaller base font than landscape's
  // single-line frameNameInline since it has to share room with a 2.5x
  // smaller token image, not the whole panel width.
  frameNamePortraitHud: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#eee",
    textShadow: "0 1px 2px #000",
    whiteSpace: "normal",
    overflowWrap: "break-word",
    wordBreak: "normal",
    lineHeight: 1.15,
    minWidth: 0,
  },
  targetRange: {
    fontSize: 11,
    color: "#999",
    display: "block",
    marginTop: 1,
  },
  deadBadge: {
    position: "absolute",
    top: 6,
    right: 8,
    fontSize: 22,
    fontWeight: "bold",
    color: "#cc2222",
    letterSpacing: 2,
    textShadow: "0 0 6px #000, 0 1px 4px #000",
    pointerEvents: "none",
  },
  actionBar: {
    position: "relative",
    flexShrink: 0,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
    padding: "4px 8px",
    background: "#111",
    borderTop: "1px solid #333",
  },
  utilityRow: {
    flexShrink: 0,
    display: "flex",
    gap: 4,
    padding: "4px 8px",
    background: "#111",
    borderTop: "1px solid #333",
  },
  utilityButton: {
    width: 52,
    height: 26,
    background: "#1c1c1c",
    border: "1px solid #444",
    borderRadius: 4,
    color: "#999",
    fontSize: 10,
    letterSpacing: 0.5,
    cursor: "pointer",
  },
  actionButton: {
    position: "relative",
    width: 52,
    height: 52,
    background: "#1c1c1c",
    border: "1px solid #444",
    borderRadius: 4,
    cursor: "default",
    flexShrink: 0,
    overflow: "hidden",
  },
  actionIcon: {
    position: "absolute",
    inset: 4,
    objectFit: "contain",
  },
  actionButtonFlash: {
    borderColor: "#cc0",
    boxShadow: "inset 0 0 10px rgba(255, 220, 50, 0.5)",
    background: "#2a2a0a",
  },
  actionCooldownOverlay: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
  },
  actionCooldownText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    textShadow: "0 0 4px #000, 0 1px 3px #000",
    lineHeight: 1,
  },
  actionKeybind: {
    position: "absolute",
    bottom: 2,
    right: 4,
    fontSize: 10,
    color: "#666",
    lineHeight: 1,
    pointerEvents: "none",
  },
  log: {
    flexShrink: 0,
    height: 110,
    background: "#1a1a1a",
    borderTop: "1px solid #333",
    padding: "6px 8px",
    overflowY: "auto",
    lineHeight: 1.5,
  },
  touchControlButtonActive: {
    borderColor: "#ff8c1a",
    color: "#ff8c1a",
    background: "#2a1c0a",
  },
  // Landscape phone: the screen is a 20/60/20 row (left panel, scene,
  // right panel) instead of fixed-position overlays scattered over a
  // full-screen canvas - each panel sizes/shrinks its own contents via
  // normal flexbox rather than pixel math guessing what fits.
  landscapeRow: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "row",
  },
  // minWidth is a floor, not a fixed size: at 20% the panel is normally
  // plenty wide, but on a narrow/short device it grows past 20% (shrinking
  // the scene panel, which just letterboxes smaller) rather than squeezing
  // the ability grid down to 2 shrunk columns when 3 full-size columns
  // would otherwise fit.
  landscapeControlPanel: {
    flex: "0 0 20%",
    minWidth: LANDSCAPE_PANEL_MIN_WIDTH,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: LANDSCAPE_PANEL_PADDING,
    boxSizing: "border-box",
  },
  // Three stacked sub-panes within each control panel: unit frame (top),
  // control buttons (middle, whatever's left), joystick (bottom) - fixed
  // proportions so contents don't drift into each other or bleed into the
  // scene panel regardless of device height.
  landscapeFrameSlot: {
    flex: "0 0 15%",
    minWidth: 0,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
  },
  // overflow:hidden + minWidth/minHeight:0 clip the button grid to this
  // sub-pane's actual box - without them a wide/tall grid (more columns, or
  // not enough vertical room) just paints past the pane's edges instead of
  // being contained by it, bleeding into the target frame above or the
  // scene panel beside it.
  landscapeControlsSlot: {
    flex: "1 1 auto",
    minWidth: 0,
    minHeight: 0,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: 8,
  },
  // "Outside-aligned": buttons hug the panel's outer edge (away from the
  // scene in the middle) rather than centering toward it.
  landscapeControlsSlotLeft: {
    alignItems: "flex-start",
  },
  landscapeControlsSlotRight: {
    alignItems: "flex-end",
  },
  landscapeJoystickSlot: {
    flex: "0 0 25%",
    minWidth: 0,
    minHeight: 0,
    marginTop: 8, // extra breathing room above the joystick, beyond the panel's own gap
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  landscapeJoystickZone: {
    position: "relative",
    width: 116,
    height: 116,
  },
  // Fixed-size buttons packed into columns via native flex-wrap instead of a
  // hand-picked row grouping - prefers as few columns as fit the available
  // panel height without shrinking buttons, wrapping to another column only
  // when one is actually needed. column-reverse fills bottom-to-top; the
  // left panel's outer edge is the screen's left edge, so the default wrap
  // direction (new columns toward the cross-end, i.e. rightward/inward)
  // already reads outside-to-inside.
  landscapeTouchControlsRow: {
    display: "flex",
    flexDirection: "column-reverse",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    height: "100%",
  },
  // Same as landscapeTouchControlsRow, but the right panel's outer edge is
  // the screen's right edge - wrap-reverse flips the cross-axis so the
  // first column lands on the right (outside) and later columns wrap
  // leftward (inside), instead of the default left-to-right.
  landscapeActionGrid: {
    display: "flex",
    flexDirection: "column-reverse",
    flexWrap: "wrap-reverse",
    justifyContent: "center",
    gap: 8,
    height: "100%",
  },
  // Portrait phone: a top-to-bottom flex column of 5 bands (frames, scene,
  // controls, joysticks, bottom buttons) - same idea as landscape's
  // left-to-right row of panels, just rotated, and with real flexbox
  // sizing instead of position:fixed pixel-offset math.
  portraitColumn: {
    flex: 1,
    minHeight: 0,
    position: "relative", // positioning root for chatPanelLandscape (reused here to cover the whole column, not just the scene band)
    display: "flex",
    flexDirection: "column",
  },
  portraitFrameBand: {
    flex: "0 0 9%",
    minHeight: 0,
    display: "flex",
    flexDirection: "row",
  },
  portraitFramePane: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    padding: 8,
    boxSizing: "border-box",
  },
  // flex-shrink:1 (unlike the other bands, which are all 0) - the scene
  // canvas is protected from shrinking (see its portrait-specific override
  // below) so if the column ever runs short on height, this is the band
  // that gives up space first instead of the scene.
  portraitControlsBand: {
    flex: "0 1 auto",
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "4px 8px",
    boxSizing: "border-box",
  },
  // justifyContent:space-between with exactly two children pins them to
  // the row's own left/right edges - same edges the action rows below use
  // (same horizontal padding), so Tab/Atk end up flush above column 1 and
  // column 5 of the grid without needing to match its column math exactly.
  portraitTabAtkRow: {
    display: "flex",
    justifyContent: "space-between",
  },
  // space-between (fixed-size square buttons, extra room goes into the
  // gaps) instead of flex:1 (which stretched buttons into wide rectangles
  // to fill the row) - same edges as portraitTabAtkRow's own space-between
  // treatment, so Tab/Atk still land above column 1 and column 5.
  portraitActionRow: {
    display: "flex",
    justifyContent: "space-between",
  },
  // Extra padding (beyond the band's own gap) around each joystick zone so
  // a full-deflection drag stays clear of the controls above and the
  // bottom buttons below instead of visually crowding them.
  // space-between (not space-around) pins the two sticks to the row's own
  // edges - so aside from the row's own padding, each stick sits flush
  // against the screen edge instead of drifting toward the center.
  portraitJoystickBand: {
    flex: "0 0 auto",
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    padding: "10px 24px",
    boxSizing: "border-box",
  },
  portraitBottomButtonsBand: {
    flex: "0 0 auto",
    display: "flex",
    gap: 8,
    padding: 6,
    boxSizing: "border-box",
  },
  // Half-height, roughly one grid-column wide - sized to sit above a single
  // column of the action grid below rather than spanning it.
  touchControlButtonPortrait: {
    flex: "0 0 18%",
    height: 22,
    background: "#1c1c1c",
    border: "1px solid #444",
    borderRadius: 4,
    color: "#ccc",
    fontSize: 11,
    fontWeight: "bold",
    letterSpacing: 0.5,
    cursor: "pointer",
  },
  // flex:1 (equal width, filling the full-width row) instead of the
  // landscape grid's fixed 43x43 - portrait has the whole screen width to
  // spread 5 buttons across instead of a narrow side panel.
  actionButtonPortrait: {
    flex: "0 0 44px",
    width: 44,
    height: 44,
  },
  // Chat/Menu, portrait: normal-flow buttons filling the bottom band
  // (unlike landscape's absolutely-positioned corner buttons - see
  // chatButtonLandscape/menuButtonLandscape), splitting its width evenly.
  bottomBandButtonPortrait: {
    flex: 1,
    height: 32,
    background: "#1c1c1c",
    border: "1px solid #444",
    borderRadius: 4,
    color: "#ccc",
    fontSize: 13,
    fontWeight: "bold",
    cursor: "pointer",
  },
  // Landscape phone: Chat/Menu corner buttons, absolutely positioned within
  // the scene panel (canvasWrapper, which is position:relative) instead of
  // fixed-to-viewport - "live in the scene pane" per the panel redesign.
  chatButtonLandscape: {
    position: "absolute",
    zIndex: 20,
    left: 8,
    bottom: 8,
    width: 52,
    height: 28,
    background: "#1c1c1c",
    border: "1px solid #444",
    borderRadius: 4,
    color: "#ccc",
    fontSize: 11,
    fontWeight: "bold",
    cursor: "pointer",
  },
  menuButtonLandscape: {
    position: "absolute",
    zIndex: 20,
    right: 8,
    bottom: 8,
    width: 52,
    height: 28,
    background: "#1c1c1c",
    border: "1px solid #444",
    borderRadius: 4,
    color: "#ccc",
    fontSize: 11,
    fontWeight: "bold",
    cursor: "pointer",
  },
  chatButtonActive: {
    borderColor: "#4caf50",
    color: "#4caf50",
    background: "#0d2b0d",
  },
  // Covers the top 2/3 of the scene panel when chat is toggled on.
  chatPanelLandscape: {
    position: "absolute",
    zIndex: 15,
    top: 0,
    left: 0,
    right: 0,
    height: "66.6667%",
    background: "rgba(20,20,20,0.85)",
    padding: "8px 12px",
    overflowY: "auto",
    fontSize: 13,
    lineHeight: 1.5,
    color: "#ddd",
    boxSizing: "border-box",
  },
  menuDialogLandscape: {
    position: "absolute",
    zIndex: 20,
    top: 16,
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    background: "rgba(20,16,12,0.97)",
    border: "1px solid #7a5a2a",
    borderRadius: 6,
    padding: 12,
  },
  menuDialogButton: {
    width: 160,
    height: 36,
    background: "#1c1c1c",
    border: "1px solid #444",
    borderRadius: 4,
    color: "#eee",
    fontSize: 13,
    cursor: "pointer",
  },
  // Shared by both landscape and portrait control panels - size and look,
  // not position (each orientation's own container handles that).
  touchControlButtonLandscape: {
    width: 43,
    height: 43,
    background: "#1c1c1c",
    border: "1px solid #444",
    borderRadius: 4,
    color: "#ccc",
    fontSize: 13,
    fontWeight: "bold",
    letterSpacing: 0.5,
    cursor: "pointer",
  },
  actionButtonLandscape: {
    width: 43, // 48 * 0.9
    height: 43,
  },
  canvasWrapper: {
    flex: 1,
    position: "relative",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#111",
  },
  respawnOverlay: {
    position: "absolute",
    top: 12,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 10,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    background: "rgba(0,0,0,0.7)",
    border: "1px solid #555",
    borderRadius: 6,
    padding: "8px 18px",
    pointerEvents: "auto",
  },
  respawnCountdown: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#cc2222",
    letterSpacing: 1,
  },
  respawnButton: {
    fontSize: 16,
    fontWeight: "bold",
    padding: "6px 20px",
    background: "#2a5a2a",
    color: "#cfc",
    border: "1px solid #4a9a4a",
    borderRadius: 4,
    cursor: "pointer",
  },
  lootWindow: {
    position: "absolute",
    zIndex: 20,
    background: "rgba(20,16,12,0.95)",
    border: "1px solid #7a5a2a",
    borderRadius: 6,
    padding: "10px 16px 14px",
    minWidth: 260,
    pointerEvents: "auto",
  },
  lootHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    cursor: "move",
    userSelect: "none",
  },
  lootTitle: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#d4a84b",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  lootClose: {
    background: "none",
    border: "none",
    color: "#888",
    fontSize: 16,
    cursor: "pointer",
    lineHeight: 1,
    padding: "0 2px",
  },
  lootTable: {
    borderCollapse: "collapse",
  },
  lootRow: {
    borderBottom: "1px solid #333",
  },
  lootNameCell: {
    padding: "4px 12px 4px 0",
    textAlign: "left",
  },
  lootMetaCell: {
    padding: "4px 12px 4px 0",
    textAlign: "left",
    color: "#888",
    fontSize: 11,
    whiteSpace: "nowrap",
  },
  lootTakeCell: {
    padding: "4px 0",
    textAlign: "right",
  },
  lootItemName: {
    color: "#e8d5a0",
    fontSize: 13,
  },
  lootTake: {
    background: "none",
    border: "1px solid #7a5a2a",
    borderRadius: 3,
    color: "#d4a84b",
    fontSize: 11,
    cursor: "pointer",
    padding: "1px 6px",
    whiteSpace: "nowrap",
  },
  lootOwned: {
    color: "#888",
    fontSize: 11,
    marginLeft: 4,
  },
  lootItemNameOwned: {
    textDecoration: "line-through",
    color: "#888",
  },
  charSheetWrapper: {
    position: "absolute",
    zIndex: 25,
    right: 20,
    top: "50%",
    transform: "translateY(-50%)",
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
  },
  // Portrait phone: covers the region between the frames and the log. The
  // border/background live on this fixed-size wrapper (the "frame"), with
  // overflow:hidden clipping to it, while charSheetScrollArea (below)
  // scrolls the actual content inside - so the border stays put as a
  // window frame instead of scrolling away with the content and leaving
  // its bottom edge hidden until you scroll all the way down.
  charSheetWrapperPortrait: {
    position: "fixed",
    zIndex: 25,
    left: 8,
    right: 8,
    top: 100, // clears the portrait HUD frames (header 18 + row with 60px image, from top:8)
    bottom: 110 + 34, // styles.log.height + the utility row below it
    background: "rgba(20,16,12,0.97)",
    border: "1px solid #7a5a2a",
    borderRadius: 6,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  // Landscape phone: same fixed-frame-with-scrolling-content idea as
  // charSheetWrapperPortrait, just inset from all four edges instead of
  // pinned to the frames/log gap (canvas fills the whole screen here).
  charSheetWrapperLandscape: {
    position: "fixed",
    zIndex: 25,
    top: 16,
    left: 16,
    right: 16,
    bottom: 16,
    background: "rgba(20,16,12,0.97)",
    border: "1px solid #7a5a2a",
    borderRadius: 6,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  // The scrollable content area inside charSheetWrapperPortrait/Landscape -
  // flex:1 + minHeight:0 lets it shrink below its content's natural height
  // so overflowY:auto actually triggers, instead of growing the flex
  // column (and its fixed-size parent) to fit.
  charSheetScrollArea: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    padding: "10px 16px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  charSheet: {
    background: "rgba(20,16,12,0.97)",
    border: "1px solid #7a5a2a",
    borderRadius: 6,
    padding: "10px 16px 14px",
    width: 480,
    pointerEvents: "auto",
  },
  charSheetCandidatePane: {
    background: "rgba(20,16,12,0.97)",
    border: "1px solid #7a5a2a",
    borderRadius: 6,
    padding: "10px 16px 14px",
    width: 440,
    pointerEvents: "auto",
  },
  // Portrait phone: overlays the character sheet (same region it occupies)
  // instead of sitting inline above it, since the candidate list can run
  // long and pushing the sheet down would bury it off-screen.
  charSheetCandidatePanePortrait: {
    position: "fixed",
    zIndex: 26,
    left: 8,
    right: 8,
    top: 100, // clears the portrait HUD frames (header 18 + row with 60px image, from top:8)
    bottom: 110 + 34, // styles.log.height + the utility row below it
    background: "rgba(20,16,12,0.97)",
    border: "1px solid #7a5a2a",
    borderRadius: 6,
    padding: "10px 16px 14px",
    boxSizing: "border-box",
    overflowY: "auto",
    pointerEvents: "auto",
  },
  // Landscape phone: same overlay-in-front-of-the-sheet idea, inset from
  // the edges like charSheetWrapperLandscape instead of the frames/log gap.
  charSheetCandidatePaneLandscape: {
    position: "fixed",
    zIndex: 26,
    top: 16,
    left: 16,
    right: 16,
    bottom: 16,
    background: "rgba(20,16,12,0.97)",
    border: "1px solid #7a5a2a",
    borderRadius: 6,
    padding: "10px 16px 14px",
    boxSizing: "border-box",
    overflowY: "auto",
    pointerEvents: "auto",
  },
  charSheetCandidateTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#d4a84b",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  charSheetCandidateListWrapper: {
    maxHeight: 320,
    overflowY: "auto",
  },
  charSheetCandidateTable: {
    borderCollapse: "collapse",
    width: "100%",
  },
  charSheetCandidateRow: {
    borderBottom: "1px solid #333",
    fontSize: 12,
    cursor: "pointer",
  },
  charSheetCandidateElvlCell: {
    padding: "3px 8px 3px 0",
    color: "#888",
    whiteSpace: "nowrap",
    textAlign: "left",
    verticalAlign: "top",
  },
  charSheetCandidateNameCell: {
    padding: "3px 0",
    width: "100%",
    color: "#e8d5a0",
    verticalAlign: "top",
  },
  charSheetCandidateEmpty: {
    fontSize: 12,
    color: "#555",
  },
  charSheetCandidateError: {
    fontSize: 11,
    color: "#cc6666",
    marginBottom: 6,
  },
  charSheetEquipRowClickable: {
    cursor: "pointer",
  },
  charSheetEquipRowHover: {
    background: "rgba(212,168,75,0.06)",
  },
  charSheetEquipRowExpanded: {
    background: "rgba(212,168,75,0.12)",
  },
  charSheetHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  charSheetTitle: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#d4a84b",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  charSheetBody: {
    display: "flex",
    gap: 20,
  },
  charSheetBodyPortrait: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  charSheetColumn: {
    flex: 1,
    minWidth: 0,
  },
  // Stats laid out as two CSS columns (rather than one long list) so the
  // portrait character sheet doesn't need as much vertical scroll.
  charSheetStatsColumns: {
    columnCount: 2,
    columnGap: 20,
  },
  charSheetColumnTitle: {
    fontSize: 11,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  charSheetEquipTable: {
    borderCollapse: "collapse",
    width: "100%",
  },
  charSheetEquipRow: {
    borderBottom: "1px solid #333",
    fontSize: 12,
  },
  charSheetSlotCell: {
    padding: "3px 8px 3px 0",
    color: "#888",
    whiteSpace: "nowrap",
    textAlign: "left",
    verticalAlign: "top",
  },
  charSheetElvlCell: {
    padding: "3px 8px 3px 0",
    color: "#888",
    whiteSpace: "nowrap",
    textAlign: "left",
    verticalAlign: "top",
  },
  charSheetNameCell: {
    padding: "3px 0",
    width: "100%",
    verticalAlign: "top",
  },
  // Reserves two lines of height (fontSize 11 * lineHeight 1.3 * 2 lines =
  // 28.6px) on every row, filled or empty, so rows stay regularly spaced.
  charSheetNameBox: {
    fontSize: 11,
    lineHeight: 1.3,
    height: 28.6,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  charSheetEmptySlot: {
    color: "#555",
  },
  charSheetStatGroup: {
    marginBottom: 10,
  },
  charSheetStatGroupTitle: {
    fontSize: 13,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingTop: 6,
    marginBottom: 3,
  },
  charSheetStatsList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 3,
  },
  charSheetStatRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 12,
    color: "#7fae7f",
  },
  itemTooltipAnchor: {
    display: "inline-block",
    cursor: "default",
  },
  itemTooltip: {
    position: "fixed",
    zIndex: 100,
    background: "rgba(20,16,12,0.97)",
    border: "1px solid #7a5a2a",
    borderRadius: 6,
    padding: "8px 12px",
    minWidth: 180,
    maxWidth: 320,
    pointerEvents: "none",
  },
  itemTooltipName: {
    color: "#d4a84b",
    fontSize: 14,
    fontWeight: "bold",
  },
  itemTooltipMeta: {
    color: "#999",
    fontSize: 11,
    marginTop: 2,
  },
  itemTooltipStats: {
    marginTop: 6,
    display: "flex",
    flexDirection: "column",
    gap: 1,
  },
  itemTooltipStat: {
    color: "#7fae7f",
    fontSize: 12,
  },
  itemTooltipDescription: {
    color: "#aaa",
    fontSize: 12,
    fontStyle: "italic",
    marginTop: 6,
  },
  statTooltipLine: {
    color: "#7fae7f",
    fontSize: 12,
  },
  charSheetStatLabelHoverable: {
    cursor: "help",
    borderBottom: "1px dotted #667",
  },
  statusBarLeft: {
    position: "absolute",
    left: 8,
    bottom: 8,
    display: "flex",
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    pointerEvents: "none",
  },
  statusBarRight: {
    position: "absolute",
    right: 8,
    bottom: 8,
    display: "flex",
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    pointerEvents: "none",
  },
  // Landscape: too little room for buffs/debuffs side by side - stack the
  // buff block above the debuff block instead (DOM order is buffs-then-
  // debuffs, so plain top-to-bottom column order already puts buffs on
  // top). alignItems hugs each block to the side's outer screen edge so a
  // shorter block doesn't look adrift from a longer one above/below it.
  statusBarLeftLandscape: {
    position: "absolute",
    left: 8,
    top: 8,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 4,
    pointerEvents: "none",
  },
  statusBarRightLandscape: {
    position: "absolute",
    right: 8,
    top: 8,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 4,
    pointerEvents: "none",
  },
  // width: max-content makes each block's box size deterministic from its
  // own content instead of leaning on flex shrink-to-fit - without it, the
  // right-anchored (target) column could end up a hair wider than its text
  // at small font sizes, reading as the text overhanging the block's edge.
  statusColumn: {
    display: "flex",
    flexDirection: "column",
    gap: 1,
    width: "max-content",
  },
  statusRowLandscape: {
    fontSize: 8,
    lineHeight: 1.2,
    whiteSpace: "nowrap",
    textShadow: "0 1px 3px #000",
  },
  statusRow: {
    fontSize: 11,
    lineHeight: 1.3,
    whiteSpace: "nowrap",
    textShadow: "0 1px 3px #000",
  },
  unitTooltip: {
    position: "absolute",
    top: 8,
    right: 8,
    zIndex: 15,
    background: "rgba(20,16,12,0.95)",
    border: "1px solid #555",
    borderRadius: 6,
    padding: "8px 12px",
    minWidth: 160,
    pointerEvents: "none",
  },
  unitTooltipName: {
    color: "#e8d5a0",
    fontSize: 14,
    fontWeight: "bold",
  },
  unitTooltipStatus: {
    fontSize: 11,
    color: "#999",
    marginTop: 4,
  },
  unitTooltipTag: {
    fontSize: 11,
    color: "#d4a84b",
    marginTop: 2,
  },
  statusTooltipAnchor: {
    display: "inline-block",
    // The status bars themselves are pointerEvents: "none" (so they never
    // block clicks/targeting on the 3D scene underneath) - this re-enables
    // hover just for each individual row.
    pointerEvents: "auto",
    cursor: "default",
  },
  statusTooltip: {
    position: "fixed",
    zIndex: 100,
    background: "rgba(20,16,12,0.97)",
    border: "1px solid #556",
    borderRadius: 6,
    padding: "8px 12px",
    minWidth: 140,
    maxWidth: 280,
    pointerEvents: "none",
  },
  statusTooltipName: {
    color: "#cce",
    fontSize: 14,
    fontWeight: "bold",
  },
  statusTooltipDescription: {
    color: "#aaa",
    fontSize: 12,
    marginTop: 4,
  },
  statusTooltipAppliedBy: {
    color: "#667",
    fontSize: 11,
    marginTop: 6,
  },
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
      style={styles.statusTooltipAnchor}
      onMouseEnter={(e) => setPos({ x: e.clientX, y: e.clientY })}
      onMouseMove={(e) => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {pos && createPortal(
        <div style={{ ...styles.statusTooltip, left: pos.x + 16, top: pos.y + 16 }}>
          <div style={styles.statusTooltipName}>{name}</div>
          {description && <div style={styles.statusTooltipDescription}>{description}</div>}
          {appliedByName && <div style={styles.statusTooltipAppliedBy}>Applied by {appliedByName}</div>}
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
      style={{ display: "inline-block", cursor: "default" }}
      onMouseEnter={(e) => setPos({ x: e.clientX, y: e.clientY })}
      onMouseMove={(e) => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {pos && createPortal(
        <div style={{ ...styles.statusTooltip, left: pos.x + 16, top: pos.y + 16 }}>
          <div style={styles.statusTooltipName}>{text}</div>
        </div>,
        document.body
      )}
    </span>
  );
}

function StatusColumn({ entries, color, landscape, align }) {
  const format = landscape ? formatRemainingCompact : formatRemaining;
  return (
    <div style={styles.statusColumn}>
      {entries.map(({ key, shortName, remainingMs, name, description, appliedByName }) => (
        <StatusTooltip key={key} name={name} description={description} appliedByName={appliedByName}>
          <div style={{ ...(landscape ? styles.statusRowLandscape : styles.statusRow), color, ...(align ? { textAlign: align } : {}) }}>
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

  const containerStyle = landscape
    ? (side === "right" ? styles.statusBarRightLandscape : styles.statusBarLeftLandscape)
    : (side === "right" ? styles.statusBarRight : styles.statusBarLeft);
  // Belt-and-suspenders alongside statusColumn's width:max-content - even
  // if a row's box ends up a hair wider than its text, explicit textAlign
  // still hugs the text to the pane's outer edge instead of leaving it
  // hanging past it.
  const align = landscape ? (side === "right" ? "right" : "left") : undefined;

  return (
    <div style={containerStyle}>
      <StatusColumn entries={buffs} color="#5ec95e" landscape={landscape} align={align} />
      <StatusColumn entries={debuffs} color="#ff5c5c" landscape={landscape} align={align} />
    </div>
  );
}

function UnitBar({ label, current, max }) {
  const pct = max > 0 ? Math.round((current / max) * 100) : 0;
  return (
    <div style={{ fontSize: 11, marginTop: 4, color: "#aaa" }}>
      {label} {current?.toFixed(0)}/{max?.toFixed(0)} ({pct}%)
    </div>
  );
}

// numbersAlign positions the "current/max" label directly above one end of
// the bar - "end" (self's frame) sits above its right end, "start"
// (target's frame) above its left end, so on-screen both labels land near
// the center of the frames row, next to each other. Omitted entirely
// (rather than defaulting to a side) when the caller doesn't want it shown.
// landscape swaps to the big top-of-screen bar instead, with a plain
// percentage (no numbersAlign label) inside its own right edge.
// mirrored (target's landscape bar): fill anchors from the right instead of
// the left, so it empties toward the left (center) rather than the right -
// paired with the percentage text also moving to the bar's left edge.
function HealthBar({ current, max, numbersAlign, landscape, mirrored }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
  return (
    <div style={landscape ? styles.healthBarTrackLandscape : styles.healthBarTrack}>
      {!landscape && numbersAlign && current != null && max != null && (
        <div style={{
          position: "absolute",
          bottom: "100%",
          marginBottom: 2,
          [numbersAlign === "start" ? "left" : "right"]: 0,
          fontSize: 11,
          color: "#ccc",
          whiteSpace: "nowrap",
          textShadow: "0 1px 2px #000",
        }}>
          {Math.round(current)}/{Math.round(max)}
        </div>
      )}
      <div style={mirrored ? {
        position: "absolute",
        top: 0,
        bottom: 0,
        right: 0,
        width: `${pct * 100}%`,
        background: "#2a7a2a",
        borderRadius: 1,
      } : {
        width: `${pct * 100}%`,
        height: "100%",
        background: "#2a7a2a",
        borderRadius: 1,
      }} />
      {landscape && (
        <span style={mirrored ? styles.healthBarPctLandscapeLeft : styles.healthBarPctLandscape}>
          {Math.round(pct * 100)}
        </span>
      )}
    </div>
  );
}

// Returns the maximum range in feet for a power, or null for self-only powers.
// The JSON range field may be a number (e.g. 5.0) or a [min, max] array.
function powerMaxRange(power) {
  for (const effect of power.effects ?? []) {
    const r = effect.range;
    if (r == null) continue;
    return Array.isArray(r) ? r[1] : r;
  }
  return null;
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
    <div style={styles.unitTooltip}>
      <div style={styles.unitTooltipName}>{formatUnitName(unit)}</div>
      <UnitBar label="HP" current={unit.health} max={unit.max_health} />
      <div style={styles.unitTooltipStatus}>
        {UNIT_STATUS_LABELS[unit.status] || unit.status}
      </div>
      {tagLabel && <div style={styles.unitTooltipTag}>{tagLabel}</div>}
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
export function ItemTooltip({ item, children, style, localElvl, pinned }) {
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
    <div style={pinned ? { ...styles.itemTooltip, position: "static" } : { ...styles.itemTooltip, left: pos?.x + 16, top: pos?.y + 16 }}>
      <div style={styles.itemTooltipName}>{item.name}</div>
      {(item.slot || item.elvl != null) && (
        <div style={styles.itemTooltipMeta}>
          {item.elvl != null && <span style={color ? { color } : undefined}>e{item.elvl}</span>}
          {item.elvl != null && item.slot ? " " : ""}
          {item.slot}
        </div>
      )}
      {stats.length > 0 && (
        <div style={styles.itemTooltipStats}>
          {stats.map(([key, value]) => (
            <div key={key} style={styles.itemTooltipStat}>
              +{value.toFixed(1)} {STAT_LABELS[key] || key}
            </div>
          ))}
        </div>
      )}
      {item.description && (
        <div style={styles.itemTooltipDescription}>{item.description}</div>
      )}
    </div>
  );

  if (pinned) {
    return (
      <span style={{ ...styles.itemTooltipAnchor, ...style }}>
        {children}
        {body}
      </span>
    );
  }

  return (
    <span
      style={{ ...styles.itemTooltipAnchor, ...style }}
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
      return [`${(100 + value * 10).toFixed(0)} Max HP`];
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
      style={styles.itemTooltipAnchor}
      onMouseEnter={(e) => setPos({ x: e.clientX, y: e.clientY })}
      onMouseMove={(e) => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {pos && createPortal(
        <div style={{ ...styles.itemTooltip, left: pos.x + 16, top: pos.y + 16 }}>
          {lines.map((line, i) => <div key={i} style={styles.statTooltipLine}>{line}</div>)}
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
function basicAttackDps(stats, primaryStats) {
  const damageStatKey = primaryStats.find((s) => s === "strength" || s === "agility" || s === "intellect");
  const damageStatValue = damageStatKey ? (stats[damageStatKey] || 0) : 0;
  const statDps = damageStatKey ? damageStatValue / BASIC_ATTACK_STAT_DIVISOR : 0;

  const isMagic = damageStatKey === "intellect";
  const hastePct = isMagic
    ? ((stats.haste_rating || 0) + (stats.intellect || 0) * MAGIC_HASTE_RATING_PER_INTELLECT) / 11.71
    : ((stats.haste_rating || 0) + (stats.agility || 0) * PHYSICAL_HASTE_RATING_PER_AGILITY) / 11.71;
  const effectiveCritRating = isMagic
    ? (stats.crit_rating || 0) + (stats.intellect || 0) * MAGIC_CRIT_RATING_PER_INTELLECT
    : (stats.crit_rating || 0) + (stats.strength || 0) * PHYSICAL_CRIT_RATING_PER_STRENGTH;
  const critChancePct = 5 + effectiveCritRating / 15;

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

const STAT_GROUPS = [
  { title: "Primary", keys: ["strength", "agility", "intellect", "stamina", "basic_attack_dps"] },
  { title: "Secondary", keys: ["crit_rating", "haste_rating", "mastery_rating", "versatility_rating", "defence_rating"] },
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

// Stats Versatility Rating grants a flat 0.2x share of itself into - see
// docs/stats.md's Versatility section.
const VERSATILITY_SPREAD_KEYS = ["strength", "agility", "intellect", "defence_rating"];
const VERSATILITY_SPREAD_RATE = 0.2;

function netStats(equippedItems) {
  const total = {};
  for (const item of Object.values(equippedItems || {})) {
    for (const [key, value] of Object.entries(item.stats || {})) {
      total[key] = (total[key] || 0) + value;
    }
  }
  const versatility = total.versatility_rating || 0;
  if (versatility) {
    for (const key of VERSATILITY_SPREAD_KEYS) {
      total[key] = (total[key] || 0) + versatility * VERSATILITY_SPREAD_RATE;
    }
  }
  return total;
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
    <div style={portrait ? styles.charSheetCandidatePanePortrait : landscape ? styles.charSheetCandidatePaneLandscape : styles.charSheetCandidatePane}>
      <div style={styles.charSheetHeader}>
        <span style={styles.charSheetCandidateTitle}>{slotLabel}</span>
        <button style={styles.lootClose} onClick={onClose}>✕</button>
      </div>
      {error && <div style={styles.charSheetCandidateError}>{error}</div>}
      {loading ? (
        <div style={styles.charSheetCandidateEmpty}>Loading…</div>
      ) : (
        <div style={(portrait || landscape) ? undefined : styles.charSheetCandidateListWrapper}>
          <table style={styles.charSheetCandidateTable}>
            <tbody>
              {[...items].sort((a, b) => (b.elvl ?? -Infinity) - (a.elvl ?? -Infinity)).map(item => (
                <tr
                  key={item.id}
                  style={styles.charSheetCandidateRow}
                  onClick={equippingId ? undefined : () => onSelect(item)}
                >
                  <td style={{ ...styles.charSheetCandidateElvlCell, ...(itemColor(item, localElvl) ? { color: itemColor(item, localElvl) } : {}) }}>
                    {item.elvl ?? ""}
                  </td>
                  <td style={styles.charSheetCandidateNameCell}>
                    <ItemTooltip item={item} style={{ cursor: "pointer" }} localElvl={localElvl}>
                      <span style={styles.charSheetNameBox}>
                        {item.name}{equippingId === item.id ? " (equipping…)" : ""}
                      </span>
                    </ItemTooltip>
                  </td>
                </tr>
              ))}
              <tr
                key={UNEQUIP_ID}
                style={styles.charSheetCandidateRow}
                onClick={equippingId ? undefined : () => onSelect(null)}
              >
                <td style={styles.charSheetCandidateElvlCell}></td>
                <td style={styles.charSheetCandidateNameCell}>
                  <span style={styles.charSheetNameBox}>
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
export function CharacterSheet({ open, equippedItems, characterItemsUrl, onEquip, onClose, localElvl, primaryStats = [], portrait = false, landscape = false }) {
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
    const equippedSourceKeys = new Set(Object.values(equippedItems || {}).map(i => i.source_key));
    fetch(`${characterItemsUrl}?${params.toString()}`)
      .then(r => r.json())
      .then(items => setCandidateItems(items.filter(i => !equippedSourceKeys.has(i.source_key))))
      .catch(() => setCandidateItems([]))
      .finally(() => setCandidateLoading(false));
  }, [expandedSlot, characterItemsUrl, equippedItems]);

  if (!open) return null;

  const stats = netStats(equippedItems);
  const gearElvl = gearElevation(equippedItems);

  const toggleSlot = (slot) => {
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

  const statGroupStyle = portrait ? { ...styles.charSheetStatGroup, breakInside: "avoid" } : styles.charSheetStatGroup;

  const equipmentBlock = (
    <div style={styles.charSheetColumn}>
      <div style={styles.charSheetColumnTitle}>Equipment</div>
      <table style={styles.charSheetEquipTable}>
        <tbody>
          {EQUIPPED_SLOT_ORDER.map(slot => {
            const item = equippedItems?.[slot];
            const rowStyle = {
              ...styles.charSheetEquipRow,
              ...styles.charSheetEquipRowClickable,
              ...(hoveredSlot === slot ? styles.charSheetEquipRowHover : {}),
              ...(expandedSlot === slot ? styles.charSheetEquipRowExpanded : {}),
            };
            return (
              <tr
                key={slot}
                style={rowStyle}
                onClick={() => toggleSlot(slot)}
                onMouseEnter={() => setHoveredSlot(slot)}
                onMouseLeave={() => setHoveredSlot(current => (current === slot ? null : current))}
              >
                <td style={styles.charSheetSlotCell}>{EQUIPPED_SLOT_ABBR[slot]}</td>
                <td style={{ ...styles.charSheetElvlCell, ...(itemColor(item, localElvl) ? { color: itemColor(item, localElvl) } : {}) }}>
                  {item?.elvl ?? ""}
                </td>
                <td style={styles.charSheetNameCell}>
                  {item ? (
                    <ItemTooltip item={item} style={{ cursor: "pointer" }} localElvl={localElvl}>
                      <span style={styles.charSheetNameBox}>{item.name || formatItemName(item.identifier)}</span>
                    </ItemTooltip>
                  ) : (
                    <span style={{ ...styles.charSheetNameBox, ...styles.charSheetEmptySlot }}>Empty</span>
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
    <div style={styles.charSheetColumn}>
      <div style={styles.charSheetColumnTitle}>Stats</div>
      <div style={portrait ? styles.charSheetStatsColumns : undefined}>
        <div style={statGroupStyle}>
          <ul style={styles.charSheetStatsList}>
            <li style={styles.charSheetStatRow}>
              <span>Local Elevation</span>
              <span>{localElvl ?? "—"}</span>
            </li>
            <li style={styles.charSheetStatRow}>
              <span>Gear Elevation</span>
              <span>{gearElvl != null ? gearElvl.toFixed(1) : "—"}</span>
            </li>
          </ul>
        </div>
        {STAT_GROUPS.map(group => (
          <div key={group.title} style={statGroupStyle}>
            <div style={styles.charSheetStatGroupTitle}>{group.title}</div>
            <ul style={styles.charSheetStatsList}>
              {group.keys.map(key => {
                if (key === "basic_attack_dps") {
                  const {value, lines} = basicAttackDps(stats, primaryStats);
                  return (
                    <li key={key} style={styles.charSheetStatRow}>
                      <StatEffectTooltip lines={lines}>
                        <span style={styles.charSheetStatLabelHoverable}>{STAT_LABELS[key]}</span>
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
                  <li key={key} style={styles.charSheetStatRow}>
                    <StatEffectTooltip lines={lines}>
                      <span style={lines.length > 0 ? styles.charSheetStatLabelHoverable : undefined}>
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
    <div style={portrait ? styles.charSheetWrapperPortrait : landscape ? styles.charSheetWrapperLandscape : styles.charSheetWrapper}>
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
      <div style={(portrait || landscape) ? styles.charSheetScrollArea : styles.charSheet}>
        <div style={styles.charSheetHeader}>
          <span style={styles.charSheetTitle}>Character</span>
          <button style={styles.lootClose} onClick={onClose}>✕</button>
        </div>
        <div style={portrait ? styles.charSheetBodyPortrait : styles.charSheetBody}>
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

  const windowStyle = { ...styles.lootWindow, left: `${pos.fx * 100}%`, top: `${pos.fy * 100}%`, transform: "none" };

  return (
    <div ref={elRef} style={windowStyle}>
      <div style={styles.lootHeader} onMouseDown={handleHeaderMouseDown}>
        <span style={styles.lootTitle}>Loot{unitName ? `: ${unitName}` : ""}</span>
        <button style={styles.lootClose} onClick={onClose}>✕</button>
      </div>
      <table style={styles.lootTable}>
        <tbody>
          {items.map((item, i) => {
            const myState = item.claims?.find(c => c.character_unit_id === selfUnitId)?.state;
            const owned = myState === "owned";
            const label = CLAIM_LABEL[myState];
            const canTake = myState === "available";
            return (
              <tr key={i} style={styles.lootRow}>
                <td style={styles.lootNameCell}>
                  <ItemTooltip item={item} localElvl={localElvl}>
                    <span style={{ ...styles.lootItemName, ...(owned ? styles.lootItemNameOwned : {}) }}>
                      {item.name}
                      {label && <span style={styles.lootOwned}> {label}</span>}
                    </span>
                  </ItemTooltip>
                </td>
                <td style={{ ...styles.lootMetaCell, ...(itemColor(item, localElvl) ? { color: itemColor(item, localElvl) } : {}) }}>
                  e{item.elvl}
                </td>
                <td style={styles.lootMetaCell}>{item.slot}</td>
                <td style={styles.lootTakeCell}>
                  {canTake && <button style={styles.lootTake} onClick={() => onTake(unitId, i)}>Take</button>}
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
    <div style={styles.respawnOverlay}>
      {remaining > 0
        ? <span style={styles.respawnCountdown}>Respawn in {Math.ceil(remaining)}s</span>
        : <button style={styles.respawnButton} onClick={onRespawn}>Respawn</button>
      }
    </div>
  );
}

export default function App({
  slotToken,
  gameServerUrl,
  instanceId,
  slotId,
  zoneSourceUrl,
  characterName,
  characterTokenUrl,
  classConfigUrl,
  ownedZoneItems: initialOwnedZoneItems = {},
  equippedItems: initialEquippedItems = {},
  characterItemsUrl,
  equippedItemsUrl,
  characterSettings,
  characterSettingsUrl,
  stockAssets,
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
  const [log, setLog] = useState(["Connecting…"]);
  const [lootWindowUnitId, setLootWindowUnitId] = useState(null);
  const [charSheetOpen, setCharSheetOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsError, setSettingsError] = useState(null);
  const [buttonLayout, setButtonLayout] = useState(() => resolveButtonLayout(characterSettings?.abilityButtonMap));
  const [cameraSensitivity, setCameraSensitivity] = useState(characterSettings?.cameraSensitivity ?? 1);
  const cameraSensitivityRef = useRef(cameraSensitivity); // read by the scene every frame/drag
  cameraSensitivityRef.current = cameraSensitivity;
  const sensitivitySaveTimerRef = useRef(null);
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
  const [primaryStats, setPrimaryStats] = useState([]);
  const [flashSlot, setFlashSlot] = useState(null);
  const [gcdEndsAt, setGcdEndsAt] = useState(0);   // epoch ms; drives cooldown display
  const gcdEndsAtRef = useRef(0);                   // same value, safe to read in callbacks
  const gcdTotalMsRef = useRef(0);                  // duration of the current GCD window
  const npcPowersByZoneIdRef = useRef({});          // { [zoneUnitId]: { [powerName]: power } }
  const npcBasicAttackRangeByZoneIdRef = useRef({}); // { [zoneUnitId]: basicAttackRange }
  const npcBasicAttackSchoolByZoneIdRef = useRef({}); // { [zoneUnitId]: "physical" | "magic" }
  const npcBasicAttackStyleByZoneIdRef = useRef({});  // { [zoneUnitId]: basicAttackStyle | undefined }
  const npcTokenUrlByZoneIdRef = useRef({});          // { [zoneUnitId]: resolved absolute tokenImageUrl }
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
    fetch(classConfigUrl)
      .then(r => r.json())
      .then(cfg => {
        setPowers(cfg.powers ?? []);
        setPrimaryStats(cfg.primaryStats ?? []);
      })
      .catch(() => {});
  }, [classConfigUrl]);

  useEffect(() => {
    if (!zoneSourceUrl) return;
    fetch(zoneSourceUrl)
      .then(r => r.json())
      .then(zone => {
        const byId = {};
        const basicAttackRangeById = {};
        const basicAttackSchoolById = {};
        const basicAttackStyleById = {};
        const tokenUrlById = {};
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
          }
          barriersByMapId[map.identifier] = map.barriers ?? [];
          elvls[map.identifier] = map.elvl ?? zone.elvl;
        }
        npcPowersByZoneIdRef.current = byId;
        npcBasicAttackRangeByZoneIdRef.current = basicAttackRangeById;
        npcBasicAttackSchoolByZoneIdRef.current = basicAttackSchoolById;
        npcBasicAttackStyleByZoneIdRef.current = basicAttackStyleById;
        npcTokenUrlByZoneIdRef.current = tokenUrlById;
        mapBarriersByIdRef.current = barriersByMapId;
        setMapElvls(elvls);
        // Every unit type's powers, not just spawned units' - a status
        // applied by a unit type nobody's spawned yet at load time would
        // otherwise never resolve.
        const allNpcPowers = Object.values(zone.unitTypes ?? {}).flatMap(ut => ut.powers ?? []);
        setNpcStatusCatalog(buildStatusCatalog(allNpcPowers, zoneSourceUrl));
      })
      .catch(() => {});
  }, [zoneSourceUrl]);

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
    // Mirror server-side rejection checks so we don't set GCD on commands that
    // will certainly be rejected (target missing, dead, or out of range).
    const range = powerMaxRange(power);
    if (range != null) {
      let target = targetIdRef.current ? unitsRef.current[targetIdRef.current] : null;
      if (!target || target.status === "dead") {
        const nearestId = Object.entries(unitsRef.current)
          .filter(([, u]) =>
            u.hostility === "hostile" &&
            u.map_identifier === selfUnit?.map_identifier &&
            u.status !== "dead"
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
        if (Math.sqrt(dx * dx + dy * dy) > range + selfRadius + (target.radius ?? 0)) return;
        const barriers = mapBarriersByIdRef.current[selfUnit?.map_identifier] ?? [];
        if (!hasLineOfSight(self.x, self.y, target.position.x, target.position.y, barriers)) return;
        if (power.frontal !== false) {
          const toTarget = Math.atan2(dx, dy) * 180 / Math.PI;
          let diff = toTarget - facingRef.current;
          while (diff > 180) diff -= 360;
          while (diff < -180) diff += 360;
          if (Math.abs(diff) > 75) return;
        }
      }
    }
    const totalMs = power.globalCooldown * 1000;
    gcdTotalMsRef.current = totalMs;
    setGcd(Date.now() + totalMs);
    connRef.current?.send({ direction: "up", type: "use_power", slot });
    setFlashSlot(slot);
    setTimeout(() => setFlashSlot(null), 150);
    if (power.graphicEffects?.length || power.soundEffects?.length) {
      const targetUnit = targetIdRef.current ? unitsRef.current[targetIdRef.current] : null;
      firePowerEffects(power, {
        positions: { self: selfPosRef.current, target: targetUnit?.position, selfId: selfUnitIdForPower, targetId: targetIdRef.current },
        baseUrl: classConfigUrl,
        sceneManager: canvasRef.current,
        stockAssets,
      });
    }
  }, [powers, setGcd, classConfigUrl, handleTargetUnit, stockAssets]);

  const sendMove = useCallback(() => {
    const pos = selfPosRef.current;
    connRef.current?.send({
      direction: "up",
      type: "move",
      facing: facingRef.current,
      keys: [...movementKeysRef.current],
      ...(pos !== null ? { x: pos.x, y: pos.y } : {}),
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

  const handleCameraStickMove = useCallback((data) => {
    cameraStickRef.current = { x: data.vector.x, y: data.vector.y };
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
        u.status !== "dead" &&
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
          setCharSheetOpen(false);
          setSettingsOpen(false);
          setMenuOpen(false);
        } else if (action === "detarget") {
          handleTargetUnit(null);
        } else {
          setSettingsOpen(true);
        }
        return;
      }
      if (e.code === "KeyP") {
        setCharSheetOpen(o => !o);
        return;
      }
      if (e.code === "KeyL") {
        setLatencyOverride((current) => nextLatencyOverride(current, autoShowLatencyRef.current));
        return;
      }
      if (e.code === "KeyT") {
        if (e.shiftKey) handleStopAttacking(); else handleStartAttacking();
        return;
      }
      if (e.code === "Tab") {
        e.preventDefault();
        handleTabTarget(
          // capture current values via refs to avoid stale closure
          unitsRef.current,
          targetIdRef.current,
          selfIdentifier,
        );
        return;
      }
      const slotKey = e.code.match(/^Digit(\d)$/)?.[1];
      if (slotKey !== undefined) {
        const slot = slotKey === "0" ? 9 : parseInt(slotKey, 10) - 1;
        usePower(buttonLayoutRef.current[slot]);
        return;
      }
      const action = KEY_MAP[e.code];
      if (!action) return;
      const selfForInput = Object.values(unitsRef.current).find(u => u.zone_unit_identifier === selfIdentifierRef.current);
      if (selfForInput?.status === "dead") return;
      if (MOVEMENT_KEYS.has(action)) {
        movementKeysRef.current.add(action);
        sendMove();
      } else if (TURN_KEYS.has(action)) {
        turnKeysRef.current.add(action);
      }
    };
    const onKeyUp = (e) => {
      const action = KEY_MAP[e.code];
      if (!action) return;
      if (MOVEMENT_KEYS.has(action)) {
        movementKeysRef.current.delete(action);
        sendMove();
      } else if (TURN_KEYS.has(action)) {
        turnKeysRef.current.delete(action);
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
      onClose: () => { setDisconnected(true); addLog("Disconnected."); },
      onStateChange: ({ units: u, combatEvents = [], lootEvents = [], lootFailures = [] }) => {
        unitsRef.current = u;
        setUnits(u);
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
        const self = Object.values(u).find(un => un.zone_unit_identifier === selfIdentifierRef.current);
        for (const failure of lootFailures) {
          if (self && failure.claimed_by === self.id) {
            addLog(`Failed to loot ${failure.item.name} - please try again.`);
          }
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
      if (!target || target.status === "dead") return;
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

  const targetRange = (selfUnit && targetUnit)
    ? Math.sqrt(
        (targetUnit.position.x - selfUnit.position.x) ** 2 +
        (targetUnit.position.y - selfUnit.position.y) ** 2
      ).toFixed(1)
    : null;
  // Only resolvable for self (characterTokenUrl, a prop) and NPC targets
  // (npcTokenUrlByZoneIdRef, built from the zone config) - another
  // player's token art isn't known client-side at all (same gap as
  // statusCatalog not covering other players' powers), so their frame
  // just shows no image rather than guessing.
  const targetTokenUrl = targetUnit
    ? (targetUnit.zone_unit_identifier === selfIdentifier
        ? characterTokenUrl
        : (npcTokenUrlByZoneIdRef.current[targetUnit.zone_unit_identifier] ?? null))
    : null;

  overlayOpenRef.current = lootWindowUnitId != null || charSheetOpen || settingsOpen || menuOpen;
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
          <div style={styles.frameHudHeader}>
            {selfUnit && <HealthBar current={selfUnit.health} max={selfUnit.max_health} landscape />}
          </div>
          <div style={styles.frameImageNameRow}>
            {characterTokenUrl && <img src={characterTokenUrl} alt="" style={portrait ? styles.frameImagePortraitHud : styles.frameImageAdaptiveHud} />}
            <div style={portrait ? styles.frameNamePortraitHud : styles.frameNameInline}>{characterName ?? "—"}</div>
          </div>
          {selfUnit?.status === "dead" && <span style={styles.deadBadge}>DEAD</span>}
        </>
      );
    }
    return (
      <>
        {characterTokenUrl && <img src={characterTokenUrl} alt="" style={styles.frameImage} />}
        <div style={styles.frameInfo}>
          <strong>{characterName ?? "—"}</strong>
          {selfUnit && (
            <>
              <UnitBar label="MP" current={selfUnit.resource} max={selfUnit.max_resource} />
              <HealthBar current={selfUnit.health} max={selfUnit.max_health} numbersAlign="end" />
            </>
          )}
          {selfUnit?.status === "dead" && <span style={styles.deadBadge}>DEAD</span>}
        </div>
      </>
    );
  }

  function renderTargetFrameContent(stacked, portrait) {
    if (!targetUnit) return <span style={{ color: "#666" }}>No target</span>;
    if (stacked) {
      const nameStyle = { ...(portrait ? styles.frameNamePortraitHud : styles.frameNameInline), ...(targetUnit.hostility === "hostile" ? { color: "#ff6b6b" } : {}) };
      return (
        <>
          <div style={styles.frameHudHeader}>
            <HealthBar current={targetUnit.health} max={targetUnit.max_health} landscape mirrored />
          </div>
          <div style={styles.frameImageNameRowRight}>
            {targetTokenUrl && <img src={targetTokenUrl} alt="" style={portrait ? styles.frameImagePortraitHud : styles.frameImageAdaptiveHud} />}
            <div style={nameStyle}>
              {formatUnitName(targetUnit)}
            </div>
          </div>
          {targetUnit.status === "dead" && <span style={styles.deadBadge}>DEAD</span>}
        </>
      );
    }
    return (
      <>
        {targetTokenUrl && <img src={targetTokenUrl} alt="" style={styles.frameImage} />}
        <div style={styles.frameInfo}>
          <strong>{formatUnitName(targetUnit)}</strong>
          {targetRange != null && <span style={styles.targetRange}>{targetRange} ft</span>}
          <HealthBar current={targetUnit.health} max={targetUnit.max_health} numbersAlign="start" />
          {targetUnit.status === "dead" && <span style={styles.deadBadge}>DEAD</span>}
        </div>
      </>
    );
  }

  function renderActionSlot(button, extraStyle) {
    const slot = button + 1;
    const key = slot === 10 ? "0" : String(slot);
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

    // extraStyle also goes on the tooltip's own wrapper (not just the inner
    // button div) - it's the wrapper that's actually the flex item in a
    // flex row (e.g. portraitActionRow), so sizing like flex:1 has to be
    // set there or it's a no-op.
    return (
      <AbilityTooltip key={slot} ability={power} style={extraStyle}>
        <div
          style={{...styles.actionButton, ...extraStyle, ...(flashSlot === i ? styles.actionButtonFlash : {}), cursor: power ? "pointer" : "default", opacity: (inRange && isFacing) ? 1 : 0.3}}
          onClick={power ? () => usePower(i) : undefined}
        >
          {iconUrl && <img src={iconUrl} alt={power.name} style={styles.actionIcon}/>}
          {onCooldown && (
            <div style={{
              position: "absolute", inset: 0, borderRadius: 4, pointerEvents: "none",
              background: `conic-gradient(from -90deg, transparent ${revealedDeg}deg, rgba(0,0,0,0.65) ${revealedDeg}deg)`,
            }}/>
          )}
          {cdSecs && (
            <div style={styles.actionCooldownOverlay}>
              <span style={styles.actionCooldownText}>{cdSecs}</span>
            </div>
          )}
          <span style={styles.actionKeybind}>{key}</span>
        </div>
      </AbilityTooltip>
    );
  }

  const sceneContent = (
    <>
      <Canvas
        ref={canvasRef}
        zoneSourceUrl={zoneSourceUrl}
        units={units}
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
      <UnitTooltip unit={hoveredUnitId ? units[hoveredUnitId] : null} selfUnitId={selfUnitId} />
      <RespawnOverlay deathTime={deathTime} onRespawn={handleRespawn} />
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
        cameraSensitivity={cameraSensitivity}
        onCameraSensitivityChange={updateCameraSensitivity}
        onClose={() => setSettingsOpen(false)}
        error={settingsError}
      />
      <CharacterSheet
        open={charSheetOpen}
        equippedItems={equippedItems}
        characterItemsUrl={characterItemsUrl}
        onEquip={handleEquipItem}
        onClose={() => setCharSheetOpen(false)}
        localElvl={localElvl}
        primaryStats={primaryStats}
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
        <div style={styles.chatPanelLandscape}>
          {log.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}
      {viewportMode.isPhoneLayout && menuOpen && (
        <div style={styles.menuDialogLandscape}>
          <button
            style={styles.menuDialogButton}
            onClick={() => { setCharSheetOpen((o) => !o); setMenuOpen(false); }}
          >
            Character
          </button>
          <button
            style={styles.menuDialogButton}
            onClick={() => { setSettingsOpen(true); setMenuOpen(false); }}
          >
            Settings
          </button>
        </div>
      )}
    </>
  );

  return (
    <div
      style={styles.root}
      data-touch={viewportMode.isTouch || undefined}
      data-phone-layout={viewportMode.isPhoneLayout || undefined}
      data-orientation={viewportMode.isPhoneLayout ? (viewportMode.isPortraitPhone ? "portrait" : "landscape") : undefined}
    >
      {new URLSearchParams(window.location.search).has("debugViewport") && (
        <div style={styles.viewportDebug}>
          touch={String(viewportMode.isTouch)} phone={String(viewportMode.isPhoneLayout)}{" "}
          {viewportMode.isPhoneLayout && (viewportMode.isPortraitPhone ? "portrait" : "landscape")}
        </div>
      )}
      {latencyVisible && (
        <div style={{
          position: "fixed",
          top: viewportMode.isPortraitPhone ? (canvasRect?.bottom ?? 98) + 8 : 98,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 1000,
        }}>
          <HintTooltip text="Hit 'L' to toggle">
            <div style={{
              background: "rgba(0,0,0,0.7)", color: latencyColor(latencyMs), fontFamily: "monospace",
              fontSize: 20, fontWeight: "bold", padding: "4px 14px", borderRadius: 4,
            }}>
              {latencyMs != null ? `RTT Latency: ${latencyMs} ms` : "RTT Latency: —"}
            </div>
          </HintTooltip>
        </div>
      )}
      {viewportMode.isLandscapePhone ? (
        <div style={styles.landscapeRow}>
          <div style={styles.landscapeControlPanel}>
            <div style={styles.landscapeFrameSlot}>
              <div style={styles.frameInPanelHud}>
                {renderSelfFrameContent(true)}
              </div>
            </div>
            <div style={{ ...styles.landscapeControlsSlot, ...styles.landscapeControlsSlotLeft }}>
              <div style={styles.landscapeTouchControlsRow}>
                <button
                  style={styles.touchControlButtonLandscape}
                  title="Tab-target (Tab)"
                  onClick={() => handleTabTarget(unitsRef.current, targetIdRef.current, selfIdentifier)}
                >
                  Tab
                </button>
                <button
                  style={{
                    ...styles.touchControlButtonLandscape,
                    ...(attacking ? styles.touchControlButtonActive : {}),
                  }}
                  title="Start/stop attacking (T)"
                  onClick={() => (attacking ? handleStopAttacking() : handleStartAttacking())}
                >
                  Atk
                </button>
              </div>
            </div>
            <div style={styles.landscapeJoystickSlot}>
              <Joystick
                onMove={handleMovementStickMove}
                onEnd={handleMovementStickEnd}
                style={styles.landscapeJoystickZone}
              />
            </div>
          </div>
          <div style={styles.canvasWrapper}>
            {sceneContent}
            <button
              style={{
                ...styles.chatButtonLandscape,
                ...(chatOpen ? styles.chatButtonActive : {}),
              }}
              title="Toggle chat"
              onClick={() => setChatOpen((o) => !o)}
            >
              Chat
            </button>
            <button
              style={styles.menuButtonLandscape}
              title="Menu"
              onClick={() => setMenuOpen((o) => !o)}
            >
              Menu
            </button>
          </div>
          <div style={styles.landscapeControlPanel}>
            <div style={styles.landscapeFrameSlot}>
              <div style={styles.frameInPanelHud}>
                {renderTargetFrameContent(true)}
              </div>
            </div>
            <div ref={actionGridPaneRef} style={{ ...styles.landscapeControlsSlot, ...styles.landscapeControlsSlotRight }}>
              <div
                style={{
                  ...styles.landscapeActionGrid,
                  ...(actionGridLayout ? {
                    width: actionGridLayout.columns * actionGridLayout.size + (actionGridLayout.columns - 1) * 8,
                    height: actionGridLayout.rows * actionGridLayout.size + (actionGridLayout.rows - 1) * 8,
                  } : {}),
                }}
              >
                {Array.from({ length: 10 }, (_, i) => renderActionSlot(i, {
                  ...styles.actionButtonLandscape,
                  ...(actionGridLayout ? { width: actionGridLayout.size, height: actionGridLayout.size } : {}),
                }))}
              </div>
            </div>
            <div style={styles.landscapeJoystickSlot}>
              <Joystick
                onMove={handleCameraStickMove}
                onEnd={handleCameraStickEnd}
                style={styles.landscapeJoystickZone}
              />
            </div>
          </div>
        </div>
      ) : viewportMode.isPortraitPhone ? (
        <div style={styles.portraitColumn}>
          <div style={styles.portraitFrameBand}>
            <div style={styles.portraitFramePane}>
              <div style={styles.frameInPanelHud}>
                {renderSelfFrameContent(true, true)}
              </div>
            </div>
            <div style={styles.portraitFramePane}>
              <div style={styles.frameInPanelHud}>
                {renderTargetFrameContent(true, true)}
              </div>
            </div>
          </div>
          {/* flexShrink:0 override: if the column ever runs short on
              height, the scene should never be the one that gives up
              space - portraitControlsBand does that instead. */}
          <div style={{ ...styles.canvasWrapper, flexShrink: 0 }}>
            {sceneContent}
          </div>
          <div style={styles.portraitControlsBand}>
            <div style={styles.portraitTabAtkRow}>
              <button
                style={styles.touchControlButtonPortrait}
                title="Tab-target (Tab)"
                onClick={() => handleTabTarget(unitsRef.current, targetIdRef.current, selfIdentifier)}
              >
                Tab
              </button>
              <button
                style={{
                  ...styles.touchControlButtonPortrait,
                  ...(attacking ? styles.touchControlButtonActive : {}),
                }}
                title="Start/stop attacking (T)"
                onClick={() => (attacking ? handleStopAttacking() : handleStartAttacking())}
              >
                Atk
              </button>
            </div>
            {ACTION_ROWS_PORTRAIT.map((row, ri) => (
              <div key={ri} style={styles.portraitActionRow}>
                {row.map((i) => renderActionSlot(i, styles.actionButtonPortrait))}
              </div>
            ))}
          </div>
          <div style={styles.portraitJoystickBand}>
            <Joystick
              onMove={handleMovementStickMove}
              onEnd={handleMovementStickEnd}
              style={styles.landscapeJoystickZone}
            />
            {/* Right stick: console-style continuous camera look, symmetric with the left (movement) stick. */}
            <Joystick
              onMove={handleCameraStickMove}
              onEnd={handleCameraStickEnd}
              style={styles.landscapeJoystickZone}
            />
          </div>
          <div style={styles.portraitBottomButtonsBand}>
            <button
              style={{
                ...styles.bottomBandButtonPortrait,
                ...(chatOpen ? styles.chatButtonActive : {}),
              }}
              title="Toggle chat"
              onClick={() => setChatOpen((o) => !o)}
            >
              Chat
            </button>
            <button
              style={styles.bottomBandButtonPortrait}
              title="Menu"
              onClick={() => setMenuOpen((o) => !o)}
            >
              Menu
            </button>
          </div>
          {chatOpen && (
            <div style={styles.chatPanelLandscape}>
              {log.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <div style={styles.frames}>
            <div style={styles.selfFrame}>{renderSelfFrameContent()}</div>
            <div style={styles.targetFrame}>{renderTargetFrameContent()}</div>
          </div>
          <div style={styles.canvasWrapper}>
            {sceneContent}
          </div>
          <div style={styles.actionBar}>
            {Array.from({ length: 10 }, (_, i) => renderActionSlot(i))}
          </div>
        </>
      )}
      {/* Log: desktop only now - portrait rolled it into the Chat button. */}
      {!viewportMode.isPhoneLayout && (
        <div style={styles.log}>
          {log.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}
      {/* Char/Latency/Reload: desktop only now - both phone orientations roll these into the Menu button/dialog instead. */}
      {!viewportMode.isPhoneLayout && (
        <div style={styles.utilityRow}>
          <button
            style={styles.utilityButton}
            title="Character sheet (P)"
            onClick={() => setCharSheetOpen(o => !o)}
          >
            Char
          </button>
          <button
            style={styles.utilityButton}
            title="Settings"
            onClick={() => setSettingsOpen(true)}
          >
            Settings
          </button>
        </div>
      )}
      {disconnected && (
        <div style={{
          position: "fixed", inset: 0, display: "flex",
          alignItems: "center", justifyContent: "center",
          pointerEvents: "none",
        }}>
          <div style={{
            color: "#ff2222", fontSize: 48, fontWeight: "bold",
            textShadow: "0 0 20px #ff0000, 0 2px 4px #000",
            letterSpacing: 4,
          }}>
            DISCONNECTED
          </div>
        </div>
      )}
    </div>
  );
}
