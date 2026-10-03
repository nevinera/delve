import {useCallback, useEffect, useRef, useState} from "react";
import MapCanvas from "./MapCanvas";
import MapSidebar from "./MapSidebar";
import MapFieldsPanel from "./MapFieldsPanel";
import BarriersPanel from "./BarriersPanel";
import ConnectionsPanel from "./ConnectionsPanel";
import UnitsTab from "./UnitsTab";
import NcusPanel from "./NcusPanel";
import HotkeyHelp from "./HotkeyHelp";
import {MapDraft} from "./MapDraft";
import {UiState} from "./UiState";
import {PatrolSimState} from "./PatrolSimState";
import {WalkSimState} from "./WalkSimState";
import {loadSvgToCanvas} from "../game/svgRaster";
import {newGroupIdentifier} from "./groupIdentifiers";

// 25MB - see the map editor plan's Slice 1: comfortably above what a real
// battle-map background needs (the docs' own example is 2048x1536), and
// well under GitHub's blob API limit (~100MB encoded, so ~75MB raw) once
// Phase 2 actually commits it.
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

// The sidebar's tabs, and which of the map's shapes each one edits (the
// rest are drawn dimmed and ignore the pointer - see MapCanvas's
// activeLayers). Quests don't exist yet; NCUs live there meanwhile.
const TABS = [["map", "Map"], ["units", "Units"], ["quests", "Quests"]];
const TAB_LAYERS = {
  map: {barriers: true, connections: true, units: false, ncus: false},
  units: {barriers: false, connections: false, units: true, ncus: false},
  quests: {barriers: false, connections: false, units: false, ncus: true},
};

// The map editor's whole editing surface - canvas, tabbed sidebar, tools,
// Simulate Units and Walk Preview - with no idea where the map comes from
// or goes (the world editor's map level hosts it over the live draft).
//
// Every domain rule (barrier/connection/unit mutations, group membership)
// and every "which mode is active" rule lives in plain classes - MapDraft
// (the saved data), UiState (interaction state), PatrolSimState (the
// Simulate Units engine), WalkSimState (Walk Preview's on/off flag). This
// component holds the interaction state, wires DOM events to those
// methods, and renders. See plans/editors-as-classes.md.
//
// Host props:
// - mapData, and onMapChange(fn) - fn maps the current MapDraft to the next.
// - imageUrl: the background's displayable URL (null for none); with
//   mapData.pixelDimensions it becomes the canvas image.
// - onImageUpload(file): store a just-picked background (already read into
//   memory); this component sets imageUrl/pixelDimensions on the map.
// - unitTypes {keys, details}, items {keys, details}: what units can be and
//   drop. details are {key: {name, tokenRadius, tokenImageUrl, speedFactor}}
//   and {key: {identifier, name, slot}}.
// - ncuTokenUrls: raw NCU tokenImageUrl -> displayable URL.
// - tokenImages {options: [{value, label, url}], upload(file)}: the token
//   images an NCU can use, and storing a new one (see ImagePicker).
// - sidebarHeader: rendered at the top of the sidebar (e.g. a save bar).
export default function MapWorkbench({
  mapKey, mapData, onMapChange, imageUrl, onImageUpload, unitTypes, items,
  ncuTokenUrls, tokenImages, sidebarHeader, backUrl,
}) {
  const [tab, setTab] = useState("map");
  // Unit types added to the Units tab's palette with "+" (see UnitsTab).
  const [paletteAdditions, setPaletteAdditions] = useState([]);
  const [imageError, setImageError] = useState("");
  const draft = new MapDraft(mapData);
  const image = imageUrl && mapData.pixelDimensions ? {url: imageUrl, pixelDimensions: mapData.pixelDimensions} : null;
  const unitTypeDetails = unitTypes.details;

  function dispatch(action) {
    switch (action.type) {
      case "SET_FIELD":
        onMapChange((d) => d.setField(action.field, action.value));
        return;
      case "ADD_ENTRY":
        onMapChange((d) => d.addEntry(action.section, action.entry));
        return;
      case "REMOVE_ENTRY":
        onMapChange((d) => d.removeEntry(action.section, action.index));
        return;
      case "UPDATE_ENTRY_FIELD":
        onMapChange((d) => d.updateEntryField(action.section, action.index, action.field, action.value));
        return;
      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  // The 2D top-down canvas shows the background as a plain <img> at a fixed
  // layout size (image.pixelDimensions), scaled purely via a CSS transform
  // for pan/zoom (see MapCanvas.jsx) - great for panning performance, but a
  // `transform: scale()` only ever bitmap-scales whatever was rasterized at
  // that fixed layout size; it never re-rasterizes on zoom. For an SVG
  // background that means the browser only ever renders it once, at
  // whatever (often modest, arbitrary) resolution its own declared
  // width/height implies - unlike the walk preview and the real game
  // client, which each deliberately rasterize an SVG themselves at a much
  // higher, map-scale-appropriate resolution (see game/svgRaster.js).
  // Mirrors that fix here too: a separately pre-rasterized, high-res bitmap
  // used only for on-screen display in the 2D canvas - image.url itself
  // (the actual asset committed on Save, and what the walk preview reads)
  // is left untouched, still the raw SVG.
  const [displayImageUrl, setDisplayImageUrl] = useState(null);
  useEffect(() => {
    if (!image) { setDisplayImageUrl(null); return; }
    const isSvg = Boolean(mapData.imageUrl?.toLowerCase().endsWith(".svg"));
    if (!isSvg) { setDisplayImageUrl(image.url); return; }

    let cancelled = false;
    let objectUrl = null;
    // Best-effort: a canvas 2D context isn't guaranteed everywhere (jsdom
    // has none at all - see MapPreviewScene's own WebGL note for the same
    // caveat), and a malformed SVG could fail to decode - either way,
    // displayImageUrl just stays at its fallback (image.url, the original
    // raw SVG) rather than this enhancement ever crashing the editor.
    loadSvgToCanvas(image.url, mapData.feetDimensions).then((canvas) => {
      if (cancelled) return;
      canvas.toBlob((blob) => {
        if (cancelled || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setDisplayImageUrl(objectUrl);
      }, "image/png");
    }).catch(() => {});

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // Only the image itself (a fresh upload/load) or a feetDimensions edit
    // (svgRasterSize's density target) should re-trigger a re-rasterize.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image?.url, mapData.imageUrl, mapData.feetDimensions]);

  const [uiState, setUiState] = useState(() => new UiState());
  const canPlaceOnMap = Boolean(mapData.feetDimensions?.width && mapData.feetDimensions?.height);

  // UnitsPanel mirrors its own expandedIndices up via an effect that calls
  // this directly (see UnitsPanel.jsx), with the callback itself in that
  // effect's own dependency array - unlike every other handler below (only
  // ever invoked from a real user event), this one needs a stable identity
  // via useCallback/the functional-updater form, or a fresh arrow function
  // every render would make that effect re-fire and call back in every
  // time, forever.
  const setExpandedUnitIndices = useCallback((indices) => {
    setUiState((s) => s.with({expandedUnitIndices: indices}));
  }, []);

  // NCU selection/hover/expansion is plain local state - unlike units,
  // nothing else (grouping, simulation, focus-scrolling) reads it.
  const [selectedNcuIndex, setSelectedNcuIndex] = useState(null);
  const [hoveredNcuIndex, setHoveredNcuIndex] = useState(null);
  const [expandedNcuIndices, setExpandedNcuIndices] = useState(() => new Set());

  function switchTab(next) {
    setUiState(uiState.clearModes().with({hoveredUnitType: null, hoveredGroupIdentifier: null, hoveredUnitIndex: null}));
    setTab(next);
  }

  // Arming a palette entry places units of that type with each map click
  // until it's pressed again (or Escape - see MapCanvas).
  function armUnitType(unitTypeKey) {
    setUiState(unitTypeKey ? uiState.startAddUnit(unitTypeKey) : uiState.clearModes());
  }

  // Every unit placed from the palette starts in a group of its own.
  function prepareUnit(entry) {
    return {...entry, groupIdentifier: newGroupIdentifier(mapData.units)};
  }

  // A unit authored before every unit had a group gets one when its group
  // is opened.
  function openGroupOf(unitIndex) {
    let identifier = mapData.units[unitIndex].groupIdentifier;
    if (!identifier) {
      identifier = newGroupIdentifier(mapData.units);
      handleChange(draft.updateEntryField("units", unitIndex, "groupIdentifier", identifier));
    }
    setUiState(uiState.clearModes().with({openGroup: identifier, hoveredGroupIdentifier: null}));
  }

  function closeGroup() {
    setUiState(uiState.clearModes().with({openGroup: null}));
  }

  function focusUnitFromMap(unitIndex) {
    setUiState(uiState.focusUnit(unitIndex));
  }

  // Shift-clicking a unit with a group open: a member leaves for a group of
  // its own, anyone else joins. Closes the group once nobody's left in it.
  function toggleGroupMember(unitIndex) {
    const {openGroup} = uiState;
    if (!openGroup) return;
    const next = draft.toggleGroupMember(openGroup, unitIndex, newGroupIdentifier(mapData.units));
    handleChange(next);
    if (!next.data.units.some((unit) => unit.groupIdentifier === openGroup)) closeGroup();
  }

  // Renaming a group touches both the units themselves (MapDraft) and the
  // open group (UiState).
  function renameGroup(oldName, newName) {
    handleChange(draft.renameGroup(oldName, newName));
    setUiState(uiState.renameGroup(oldName, newName));
  }

  // Escape closes the open group - unless something's armed, which Escape
  // cancels first (see MapCanvas).
  useEffect(() => {
    if (tab !== "units" || !uiState.openGroup || !uiState.nothingArmed) return;
    function onKeyDown(e) {
      if (e.key === "Escape") setUiState((s) => s.with({openGroup: null}));
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [tab, uiState]);

  // Global editor hotkeys - B/C/L/P start the same single-shot add-tools as
  // BarriersPanel/ConnectionsPanel's own buttons (B also immediately arms
  // first-point placement, mirroring "+ Add Wall"'s own behavior - see
  // BarriersPanel.jsx's addWall; the hotkey version skips that panel's own
  // sidebar-expand niceties, which aren't essential to actually placing
  // points), and "?" shows the hotkey list (Escape closes it). Units don't
  // get a hotkey yet. Only fires with nothing else armed already (mirrors
  // each button's own disabled condition) and not while typing in a field.
  // Not W - that's reserved for WASD panning (see MapCanvas.jsx), which
  // needs to keep working *while* a placement like this is active (so you
  // can pan mid-boundary-placement), unlike these single-shot tools.
  useEffect(() => {
    function onKeyDown(e) {
      const t = e.target;
      const isEditable = t instanceof HTMLElement && (
        t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable
      );
      if (isEditable) return;

      if (uiState.showHotkeyHelp) {
        if (e.key === "Escape") setUiState(uiState.with({showHotkeyHelp: false}));
        return;
      }
      if (patrolSim.current.running || walkSim.active) return;

      if (e.key === "?") {
        setUiState(uiState.with({showHotkeyHelp: true}));
        return;
      }

      if (tab !== "map" || !uiState.nothingArmed || !canPlaceOnMap) return;

      if (e.key === "b" || e.key === "B") {
        const newIndex = mapData.barriers.length;
        handleChange(draft.addWall());
        setUiState(uiState.with({selectedBarrierIndex: newIndex}).startBarrierPlacement(newIndex, 0));
      } else if (e.key === "c" || e.key === "C") {
        setUiState(uiState.startTool("add-circle"));
      } else if (e.key === "l" || e.key === "L") {
        setUiState(uiState.startTool("add-line-connection"));
      } else if (e.key === "p" || e.key === "P") {
        setUiState(uiState.startTool("add-point-connection"));
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // draft/handleChange/setUiState are plain values/functions read via
    // closure here like everywhere else in this file - only the values
    // below actually change what this handler should do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uiState, canPlaceOnMap, mapData.barriers, tab]);

  // Simulate Units mode (Slice 9): a read-only preview of patrol/wander
  // movement (see PatrolSimState.js) - mapData itself is never touched, so
  // exiting always restores each unit's authored position exactly.
  const patrolSim = useRef(new PatrolSimState());
  const [simPositions, setSimPositions] = useState(null);
  const [simSpeed, setSimSpeedState] = useState(1);
  const simRafRef = useRef(null);
  const simLastTimeRef = useRef(null);
  // Walk Preview mode (Phase 2, formerly Phase 3 - see the plan's reordering
  // note): a read-only "walk it" 3D preview (MapPreviewScene/MapPreviewCanvas)
  // swapped in for MapCanvas's whole top-down view. Mutually exclusive with
  // Simulate Units (the toolbar disables each while the other is active) -
  // both are read-only previews of the current draft, never touching mapData.
  const [walkSim, setWalkSim] = useState(() => new WalkSimState());

  // Starting a simulation clears every other mode first, same mutual-
  // exclusion convention as the rest of this editor - simulating is a
  // read-only preview, not something that coexists with an armed edit.
  function startSimulation() {
    setUiState(uiState.clearModes());
    setWalkSim(walkSim.stop());
    setSimPositions(patrolSim.current.start(mapData.units));
  }

  function stopSimulation() {
    patrolSim.current.stop();
    setSimPositions(null);
  }

  function toggleSimulation() {
    if (patrolSim.current.running) stopSimulation();
    else startSimulation();
  }

  function setSimSpeed(speed) {
    patrolSim.current.setSpeed(speed);
    setSimSpeedState(speed);
  }

  function togglePreview() {
    if (walkSim.active) {
      setWalkSim(walkSim.stop());
      return;
    }
    setUiState(uiState.clearModes());
    stopSimulation();
    setWalkSim(walkSim.start());
  }

  // Drives the sim forward every animation frame while running, then
  // mirrors its positions into simPositions to trigger a render - real
  // elapsed time is clamped before scaling by simSpeed so a throttled/
  // backgrounded tab can't produce one huge catch-up jump when it resumes.
  useEffect(() => {
    if (!patrolSim.current.running) return;
    simLastTimeRef.current = performance.now();

    function frame(now) {
      const rawDt = Math.min((now - simLastTimeRef.current) / 1000, 0.05);
      simLastTimeRef.current = now;
      setSimPositions(patrolSim.current.tick(mapData.units, unitTypeDetails, rawDt));
      simRafRef.current = requestAnimationFrame(frame);
    }

    simRafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(simRafRef.current);
    // mapData.units/unitTypeDetails are read via closure each frame, not
    // re-subscribed to - editing is locked while simulating, so units can't
    // change out from under the loop; unitTypeDetails updating mid-sim
    // (a background fetch resolving) is harmless to pick up next frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simPositions === null]);

  function handleChange(nextDraft) {
    onMapChange(() => nextDraft);
  }

  // "insert" mode splices the clicked feet position in at pointIndex, then
  // advances to the gap right after it - a run of map clicks lays down
  // consecutive points. "edit" mode replaces the existing point at
  // pointIndex and exits immediately. Nothing is ever written for a point
  // that hasn't been placed/edited yet, so canceling (see MapCanvas) is
  // just clearing UiState's placement, no cleanup needed.
  function placePoint(feet) {
    const {barrierIndex, pointIndex, mode} = uiState.placement;

    if (mode === "edit") {
      handleChange(draft.setBarrierPoint(barrierIndex, pointIndex, feet));
      setUiState(uiState.clearPlacement());
      return;
    }

    handleChange(draft.insertBarrierPoint(barrierIndex, pointIndex, feet));
    setUiState(uiState.advanceBarrierPlacement());
  }

  // Single-shot, unlike placePoint above - re-placing one already-existing
  // connection field (position/start/end) sets it and exits, no advancing
  // to a next gap.
  function placeConnectionField(feet) {
    const {connectionIndex, field} = uiState.connectionPlacement;
    handleChange(draft.setConnectionField(connectionIndex, field, feet));
    setUiState(uiState.clearConnectionPlacement());
  }

  // Single-shot, like placeConnectionField above.
  function placeUnitPosition(feet) {
    const {unitIndex, section} = uiState.unitPlacement;
    handleChange(draft.setUnitPosition(unitIndex, feet, section));
    setUiState(uiState.clearUnitPlacement());
  }

  function updateMovement(unitIndex, fields, section = "units") {
    handleChange(draft.updateMovement(unitIndex, fields, section));
  }

  // "insert" mode appends a new step at stepIndex and advances to
  // stepIndex+1 on each click - same auto-advancing run-of-clicks pattern
  // as placePoint (wall points) above. "edit" mode replaces the existing
  // step's position (keeping its movementRate/waitTime) and exits.
  function placePatrolStep(feet) {
    const {unitIndex, stepIndex, mode, section} = uiState.patrolStepPlacement;

    if (mode === "edit") {
      handleChange(draft.setPatrolStep(unitIndex, stepIndex, feet, section));
      setUiState(uiState.clearPatrolStepPlacement());
      return;
    }

    handleChange(draft.insertPatrolStep(unitIndex, stepIndex, feet, section));
    setUiState(uiState.advancePatrolStepPlacement());
  }

  // Single-shot, like placeConnectionField/placeUnitPosition above.
  function placeWanderLocation(feet) {
    const {unitIndex, section} = uiState.wanderLocationPlacement;
    handleChange(draft.setWanderLocation(unitIndex, feet, section));
    setUiState(uiState.clearWanderLocationPlacement());
  }

  async function handleImageFile(rawFile) {
    setImageError("");

    if (!rawFile.type.startsWith("image/")) {
      setImageError("Please choose an image file.");
      return;
    }
    if (rawFile.size > MAX_IMAGE_BYTES) {
      const mb = (bytes) => (bytes / (1024 * 1024)).toFixed(1);
      setImageError(`Image must be under ${mb(MAX_IMAGE_BYTES)}MB (this one is ${mb(rawFile.size)}MB).`);
      return;
    }

    // Read the bytes into memory right away instead of holding onto the
    // original File handle until Save (which could be much later, after
    // filling in every other field) - a File picked via drag-and-drop
    // (rather than the file-picker dialog) isn't always backed by a stable
    // on-disk path, and re-reading it late can throw a browser NotFoundError
    // ("A requested file or directory could not be found...") that has
    // nothing to do with GitHub at all. A fresh File wrapping an already-
    // read ArrayBuffer is a plain in-memory Blob from here on, so
    // saveMap.js's later FileReader pass can't fail this way. An SVG is
    // committed as-is (not rasterized) - see MapPreviewScene.js's loadMap
    // and game/scene.js's own map loading, which each rasterize it
    // themselves at render time via game/svgRaster.js, sized to the map's
    // real-world scale - a stored SVG is smaller than a pre-baked raster
    // and stays losslessly re-renderable at whatever resolution a given
    // renderer needs, rather than committing to one fixed size up front.
    let file;
    try {
      file = new File([await rawFile.arrayBuffer()], rawFile.name, {type: rawFile.type});
    } catch {
      setImageError("Couldn't read that file - try choosing it again.");
      return;
    }

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const pixelDimensions = {width: img.naturalWidth, height: img.naturalHeight};
      // imageUrl is a plain sibling-file reference (see saveMap.js) - this is
      // where the "sibling file, same basename" convention actually gets
      // authored into the map, not just assumed at save time.
      const basename = mapKey.split("/").pop();
      const extension = file.name.includes(".") ? file.name.split(".").pop() : "png";
      onImageUpload(file, `${basename}.${extension}`);
      onMapChange((d) => d.setField("imageUrl", `${basename}.${extension}`).setPixelDimensions(pixelDimensions));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setImageError("Couldn't load that as an image.");
    };
    img.src = url;
  }

  // Render-only overlay while simulating: the same units with their
  // position swapped for the live sim position - mapData itself (and
  // everything derived from it, like dispatch targets) is never touched,
  // so stopping always snaps back to the authored positions exactly.
  const effectiveMapData = patrolSim.current.running && simPositions
    ? {
      ...mapData,
      units: mapData.units.map((unit, i) => ({
        ...unit,
        position: {...unit.position, x: simPositions[i].x, y: simPositions[i].y, angle: simPositions[i].angle},
      })),
    }
    : mapData;

  return (
    <div className="map-editor" data-map-key={mapKey}>
      <MapCanvas
        image={image}
        displayImageUrl={displayImageUrl}
        imageError={imageError}
        onImageFile={handleImageFile}
        backUrl={backUrl}
        mapData={effectiveMapData}
        dispatch={dispatch}
        selectedBarrierIndex={uiState.selectedBarrierIndex}
        onSelectBarrier={(i) => setUiState(uiState.with({selectedBarrierIndex: i}))}
        hoveredBarrierIndex={uiState.hoveredBarrierIndex}
        hoveredPoint={uiState.hoveredPoint}
        placement={uiState.placement}
        onPlacePoint={placePoint}
        onCancelPlacement={() => setUiState(uiState.clearPlacement())}
        selectedConnectionIndex={uiState.selectedConnectionIndex}
        onSelectConnection={(i) => setUiState(uiState.with({selectedConnectionIndex: i}))}
        hoveredConnectionIndex={uiState.hoveredConnectionIndex}
        connectionPlacement={uiState.connectionPlacement}
        onPlaceConnectionField={placeConnectionField}
        onCancelConnectionPlacement={() => setUiState(uiState.clearConnectionPlacement())}
        selectedUnitIndex={uiState.selectedUnitIndex}
        onSelectUnit={focusUnitFromMap}
        hoveredUnitIndex={uiState.hoveredUnitIndex}
        onHoverUnit={(i) => setUiState(uiState.with({hoveredUnitIndex: i}))}
        pendingUnitType={uiState.pendingUnitType}
        availableUnitTypes={unitTypeDetails}
        unitPlacement={uiState.unitPlacement}
        onPlaceUnitPosition={placeUnitPosition}
        onCancelUnitPlacement={() => setUiState(uiState.clearUnitPlacement())}
        patrolStepPlacement={uiState.patrolStepPlacement}
        onPlacePatrolStep={placePatrolStep}
        onCancelPatrolStepPlacement={() => setUiState(uiState.clearPatrolStepPlacement())}
        wanderLocationPlacement={uiState.wanderLocationPlacement}
        onPlaceWanderLocation={placeWanderLocation}
        onCancelWanderLocationPlacement={() => setUiState(uiState.clearWanderLocationPlacement())}
        hoveredPatrolStep={uiState.hoveredPatrolStep}
        expandedUnitIndices={uiState.expandedUnitIndices}
        ncuTokenUrls={ncuTokenUrls}
        selectedNcuIndex={selectedNcuIndex}
        onSelectNcu={setSelectedNcuIndex}
        hoveredNcuIndex={hoveredNcuIndex}
        onHoverNcu={setHoveredNcuIndex}
        expandedNcuIndices={expandedNcuIndices}
        activeLayers={TAB_LAYERS[tab]}
        openGroup={tab === "units" ? uiState.openGroup : null}
        onToggleGroupMember={toggleGroupMember}
        hoveredGroupIdentifier={uiState.hoveredGroupIdentifier}
        highlightedUnitIndices={uiState.hoveredUnitType ? mapData.units.flatMap((unit, i) => (unit.unitType === uiState.hoveredUnitType ? [i] : [])) : null}
        onDoubleClickUnit={tab === "units" ? openGroupOf : undefined}
        onDoubleClickEmpty={tab === "units" && uiState.openGroup ? closeGroup : undefined}
        keepUnitToolArmed={tab === "units"}
        prepareUnit={prepareUnit}
        simulating={patrolSim.current.running}
        onToggleSimulate={toggleSimulation}
        simSpeed={simSpeed}
        onSimSpeedChange={setSimSpeed}
        previewing={walkSim.active}
        onTogglePreview={togglePreview}
        tool={uiState.tool}
        onToolChange={(nextTool) => setUiState(uiState.with({tool: nextTool}))}
      />
      <MapSidebar>
        {sidebarHeader}
        <div className="map-editor-tabs" role="tablist">
          {TABS.map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "active" : ""} onClick={() => switchTab(key)}>
              {label}
            </button>
          ))}
        </div>
        {patrolSim.current.running ? (
          <div className="map-sidebar-section-heading map-simulate-notice">
            <h3>Simulating units - editing is disabled while this runs.</h3>
          </div>
        ) : walkSim.active ? (
          <div className="map-sidebar-section-heading map-simulate-notice">
            <h3>Walk preview running - editing is disabled while this runs.</h3>
          </div>
        ) : tab === "map" ? (
          <>
            <MapFieldsPanel mapData={mapData} pixelDimensions={image?.pixelDimensions} dispatch={dispatch} />
            <BarriersPanel
              barriers={mapData.barriers}
              selectedIndex={uiState.selectedBarrierIndex}
              onSelect={(i) => setUiState(uiState.with({selectedBarrierIndex: i}))}
              onHover={(i) => setUiState(uiState.with({hoveredBarrierIndex: i}))}
              onHoverPoint={(p) => setUiState(uiState.with({hoveredPoint: p}))}
              placement={uiState.placement}
              onStartPlacement={(barrierIndex, pointIndex, mode) => setUiState(uiState.startBarrierPlacement(barrierIndex, pointIndex, mode))}
              onStartPointEdit={(barrierIndex, pointIndex) => setUiState(uiState.startBarrierPointEdit(barrierIndex, pointIndex))}
              tool={uiState.tool}
              onStartAddCircle={() => setUiState(uiState.startTool("add-circle"))}
              canPlaceOnMap={canPlaceOnMap}
              otherPlacementActive={!!uiState.connectionPlacement}
              dispatch={dispatch}
            />
            <ConnectionsPanel
              connections={mapData.connections}
              selectedIndex={uiState.selectedConnectionIndex}
              onSelect={(i) => setUiState(uiState.with({selectedConnectionIndex: i}))}
              onHover={(i) => setUiState(uiState.with({hoveredConnectionIndex: i}))}
              tool={uiState.tool}
              placement={uiState.placement}
              canPlaceOnMap={canPlaceOnMap}
              connectionPlacement={uiState.connectionPlacement}
              onStartConnectionPlacement={(connectionIndex, field) => setUiState(uiState.startConnectionFieldPlacement(connectionIndex, field))}
              onStartAddPointConnection={() => setUiState(uiState.startTool("add-point-connection"))}
              onStartAddLineConnection={() => setUiState(uiState.startTool("add-line-connection"))}
              dispatch={dispatch}
            />
          </>
        ) : tab === "units" ? (
          <UnitsTab
            units={mapData.units}
            unitTypes={unitTypes}
            items={items}
            canPlaceOnMap={canPlaceOnMap}
            openGroup={uiState.openGroup}
            onOpenGroup={(group) => openGroupOf(group.memberIndices[0])}
            onCloseGroup={closeGroup}
            onRenameGroup={renameGroup}
            armedUnitType={uiState.tool === "add-unit" ? uiState.pendingUnitType : null}
            onArmUnitType={armUnitType}
            onHoverUnitType={(key) => setUiState(uiState.with({hoveredUnitType: key}))}
            paletteAdditions={paletteAdditions}
            onAddToPalette={(key) => setPaletteAdditions((current) => [...current, key])}
            hoveredGroupIdentifier={uiState.hoveredGroupIdentifier}
            onHoverGroup={(g) => setUiState(uiState.with({hoveredGroupIdentifier: g}))}
            hoveredIndex={uiState.hoveredUnitIndex}
            onHover={(i) => setUiState(uiState.with({hoveredUnitIndex: i}))}
            selectedIndex={uiState.selectedUnitIndex}
            onSelect={(i) => setUiState(uiState.with({selectedUnitIndex: i}))}
            focusUnitRequest={uiState.unitFocusRequest}
            onExpandedIndicesChange={setExpandedUnitIndices}
            unitPlacement={uiState.unitPlacement}
            onStartUnitPlacement={(unitIndex) => setUiState(uiState.startUnitPlacement(unitIndex))}
            patrolStepPlacement={uiState.patrolStepPlacement}
            onStartPatrolStepPlacement={(unitIndex, stepIndex, mode) => setUiState(uiState.startPatrolStepPlacement(unitIndex, stepIndex, mode))}
            onStartPatrolStepEdit={(unitIndex, stepIndex) => setUiState(uiState.startPatrolStepEdit(unitIndex, stepIndex))}
            wanderLocationPlacement={uiState.wanderLocationPlacement}
            onStartWanderLocationPlacement={(unitIndex) => setUiState(uiState.startWanderLocationPlacement(unitIndex))}
            onUpdateMovement={updateMovement}
            onHoverPatrolStep={(p) => setUiState(uiState.with({hoveredPatrolStep: p}))}
            dispatch={dispatch}
          />
        ) : (
          <>
            <p className="map-sidebar-hint">Quests aren't built yet. Non-combat characters (NCUs) live here meanwhile.</p>
            <NcusPanel
              ncus={mapData.ncus ?? []}
              tokenUrls={ncuTokenUrls}
              tokenImages={tokenImages}
              selectedIndex={selectedNcuIndex}
              onSelect={setSelectedNcuIndex}
              hoveredIndex={hoveredNcuIndex}
              onHover={setHoveredNcuIndex}
              onExpandedIndicesChange={setExpandedNcuIndices}
              tool={uiState.tool}
              placement={uiState.placement}
              canPlaceOnMap={canPlaceOnMap}
              onStartAddNcu={() => setUiState(uiState.startTool("add-ncu"))}
              unitPlacement={uiState.unitPlacement}
              onStartUnitPlacement={(i) => setUiState(uiState.startUnitPlacement(i, "ncus"))}
              patrolStepPlacement={uiState.patrolStepPlacement}
              onStartPatrolStepPlacement={(i, stepIndex, mode) => setUiState(uiState.startPatrolStepPlacement(i, stepIndex, mode, "ncus"))}
              onStartPatrolStepEdit={(i, stepIndex) => setUiState(uiState.startPatrolStepEdit(i, stepIndex, "ncus"))}
              onHoverPatrolStep={(p) => setUiState(uiState.with({hoveredPatrolStep: p && {...p, section: "ncus"}}))}
              wanderLocationPlacement={uiState.wanderLocationPlacement}
              onStartWanderLocationPlacement={(i) => setUiState(uiState.startWanderLocationPlacement(i, "ncus"))}
              onUpdateMovement={(i, fields) => updateMovement(i, fields, "ncus")}
              dispatch={dispatch}
            />
          </>
        )}
      </MapSidebar>
      {uiState.showHotkeyHelp && <HotkeyHelp />}
    </div>
  );
}
