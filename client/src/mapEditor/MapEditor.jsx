import {useEffect, useReducer, useRef, useState} from "react";
import MapCanvas from "./MapCanvas";
import MapSidebar from "./MapSidebar";
import MapFieldsPanel from "./MapFieldsPanel";
import BarriersPanel from "./BarriersPanel";
import ConnectionsPanel from "./ConnectionsPanel";
import UnitsPanel from "./UnitsPanel";
import {mapReducer} from "./mapReducer";
import {BASE_MOB_SPEED, initSimUnit, tickSimUnit} from "./simulateMovement";

// 25MB - see the map editor plan's Slice 1: comfortably above what a real
// battle-map background needs (the docs' own example is 2048x1536), and
// well under GitHub's blob API limit (~100MB encoded, so ~75MB raw) once
// Phase 2 actually commits it.
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

// {file, url, pixelDimensions} | null - file is null for an existing map's
// image (fetched server-side as a data URI, see Build::MapsController#edit),
// since there's no local File object for it until it's replaced.
function initialImage(initialImageDataUri, initialPixelDimensions) {
  if (!initialImageDataUri || !initialPixelDimensions) return null;
  return {file: null, url: initialImageDataUri, pixelDimensions: initialPixelDimensions};
}

export default function MapEditor({
  mapKey, initialMap, initialImageDataUri, initialPixelDimensions, backUrl,
  initialAvailableUnitTypeKeys, initialUnitTypeDetails, newUnitTypeUrl, availableUnitTypesUrl,
  initialAvailableItemKeys, initialItemDetails, newItemUrl, availableItemsUrl,
}) {
  const [image, setImage] = useState(() => initialImage(initialImageDataUri, initialPixelDimensions));
  const [imageError, setImageError] = useState("");
  const [mapData, dispatch] = useReducer(mapReducer, initialMap);
  const [selectedBarrierIndex, setSelectedBarrierIndex] = useState(null);
  const [hoveredBarrierIndex, setHoveredBarrierIndex] = useState(null);
  const [hoveredPoint, setHoveredPoint] = useState(null); // {barrierIndex, pointIndex} | null
  // {barrierIndex, pointIndex, mode: "insert" | "edit"} | null - see MapCanvas/BarriersPanel.
  // "insert" (from a "+" pill button) splices a new point in at pointIndex
  // and advances to pointIndex+1 on each click, so a run of clicks lays
  // down consecutive points; "edit" (from clicking an existing pill)
  // replaces that one point and exits - single-shot, like connectionPlacement.
  const [placement, setPlacement] = useState(null);
  const [selectedConnectionIndex, setSelectedConnectionIndex] = useState(null);
  const [hoveredConnectionIndex, setHoveredConnectionIndex] = useState(null);
  const [connectionPlacement, setConnectionPlacement] = useState(null); // {connectionIndex, field: "position" | "start" | "end"} | null
  const [selectedUnitIndex, setSelectedUnitIndex] = useState(null);
  const [hoveredUnitIndex, setHoveredUnitIndex] = useState(null);
  const [pendingUnitType, setPendingUnitType] = useState(null); // the unitType key armed for "add-unit" (see startAddUnit)
  const [unitPlacement, setUnitPlacement] = useState(null); // {unitIndex} | null - re-placing an existing unit's position
  // {unitIndex, stepIndex, mode: "insert" | "edit"} | null - a patrol step's
  // position (see MapCanvas/UnitsPanel's PatrolFields). Mirrors `placement`
  // (barrier wall points) exactly: "insert" (from "+ Add Step") appends at
  // stepIndex and advances to stepIndex+1 on each click, so a run of clicks
  // lays down consecutive waypoints; "edit" (from clicking an existing
  // step's pill) replaces just that one and exits.
  const [patrolStepPlacement, setPatrolStepPlacement] = useState(null);
  // {unitIndex} | null - re-placing a wander zone's location, single-shot
  // like unitPlacement above.
  const [wanderLocationPlacement, setWanderLocationPlacement] = useState(null);
  // {unitIndex, stepIndex} | null - hovering a patrol step's pill in
  // UnitsPanel lights up a token-sized ring at that step's position on the
  // canvas (see MovementShapes) - same idea as BarriersPanel's hoveredPoint.
  const [hoveredPatrolStep, setHoveredPatrolStep] = useState(null);
  // Mirrors UnitsPanel's own expandedIndices (which unit rows are open) up
  // here, so MovementShapes can treat "being edited" the same as hovered -
  // opaque, so its patrol path/wander circle stands out from anyone else's
  // in the same region. UnitsPanel still owns the state; this is just a
  // read-only copy reported via onExpandedIndicesChange.
  const [expandedUnitIndices, setExpandedUnitIndices] = useState(() => new Set());
  // Clicking a unit's token on the map (see MapCanvas's startDragUnit) is
  // distinct from clicking its row in UnitsPanel: the map click should open
  // that one unit's row exclusively (closing every other open row) and
  // scroll it into view there, while a direct sidebar row click just toggles
  // that row alone. {index, nonce} rather than a bare index so re-clicking
  // the same already-open unit's token still re-triggers the scroll (a
  // plain index wouldn't change, so a dependent effect wouldn't re-fire).
  const [unitFocusRequest, setUnitFocusRequest] = useState(null);
  const unitFocusNonceRef = useRef(0);
  // {groupIdentifier} | null - while active, clicking a unit (its token on
  // the map, or its row in UnitsPanel) toggles that unit's membership in
  // this group instead of that click's normal effect (select/drag on
  // canvas; expand/collapse in the sidebar) - see toggleGroupMember. Mutual
  // exclusion with the placement/tool states below, same pattern as those
  // already have with each other.
  const [groupingMode, setGroupingMode] = useState(null);
  // Drives the map's translucent-red group highlight (tokens + full-mesh
  // lines between every member pair) when a group's row is hovered in
  // UnitsPanel - groupingMode's own group is always highlighted regardless
  // of this, forcing the same visual on permanently (see MapCanvas).
  const [hoveredGroupIdentifier, setHoveredGroupIdentifier] = useState(null);
  // Group names created via "+ Add Group" before any unit has joined them -
  // a group isn't real data (docs/schema/unit.md's groupIdentifier is just
  // a plain string on each unit, no separate Map.groups list), so an empty
  // one only exists here, in memory, for this session - it's never written
  // to mapData/the saved file, and simply stops appearing if the page
  // reloads before it gains a member.
  const [pendingGroupNames, setPendingGroupNames] = useState([]);
  // The full list of unit_types/*.json keys (cheap - a directory listing,
  // see Build::MapsController#list_unit_type_keys) vs. {name, tokenRadius,
  // tokenImageUrl} for just the keys actually needed so far (units already
  // on the map, plus whichever key the author has picked/placed since) -
  // kept separate so the dropdown/tool never has to open every unit type
  // file just to list them, which doesn't scale (a repo can hold far more
  // unit types than any one map uses).
  const [availableUnitTypeKeys, setAvailableUnitTypeKeys] = useState(initialAvailableUnitTypeKeys ?? []);
  const [unitTypeDetails, setUnitTypeDetails] = useState(initialUnitTypeDetails ?? {});
  // Same cheap-list/lazy-details split, for the items a unit's lootTable
  // can reference (see Build::MapsController#list_item_keys) - itemDetails
  // is keyed by the same file-path key as availableItemKeys, but each
  // value's own `identifier` field (not necessarily the key) is what
  // actually belongs in a lootTable.
  const [availableItemKeys, setAvailableItemKeys] = useState(initialAvailableItemKeys ?? []);
  const [itemDetails, setItemDetails] = useState(initialItemDetails ?? {});
  const [refreshStatus, setRefreshStatus] = useState("");
  // "select" | "add-circle" | "add-point-connection" | "add-line-connection" | "add-unit" - see MapCanvas/BarriersPanel/ConnectionsPanel/UnitsPanel
  const [tool, setTool] = useState("select");
  const canPlaceOnMap = Boolean(mapData.feetDimensions?.width && mapData.feetDimensions?.height);
  // Simulate Units mode (Slice 9): a read-only preview of patrol/wander
  // movement, running entirely client-side (see simulateMovement.js) - the
  // editor has no live game-server connection to actually watch. Entering
  // it locks out every editing interaction (see startSimulation) and
  // replaces the sidebar with a plain status panel; simPositions is a
  // render-only overlay of {x, y, angle} per unit (parallel to mapData.units)
  // - mapData itself is never touched, so exiting always restores each
  // unit's authored position exactly.
  const [simulating, setSimulating] = useState(false);
  const [simSpeed, setSimSpeed] = useState(1);
  const [simPositions, setSimPositions] = useState(null);
  const simUnitsRef = useRef([]); // mutable per-unit sim state, not itself rendered
  const simRafRef = useRef(null);
  const simLastTimeRef = useRef(null);

  // At most one of {wall-point placement, connection-field placement,
  // unit-position placement, an armed add-tool} is ever active - starting
  // one cancels the others, rather than every trigger needing to know
  // about every other mode.
  function startBarrierPlacement(barrierIndex, pointIndex, mode = "insert") {
    setConnectionPlacement(null);
    setUnitPlacement(null);
    setPatrolStepPlacement(null);
    setWanderLocationPlacement(null);
    setGroupingMode(null);
    setTool("select");
    setPlacement({barrierIndex, pointIndex, mode});
  }

  function startBarrierPointEdit(barrierIndex, pointIndex) {
    startBarrierPlacement(barrierIndex, pointIndex, "edit");
  }

  function startConnectionFieldPlacement(connectionIndex, field) {
    setPlacement(null);
    setUnitPlacement(null);
    setPatrolStepPlacement(null);
    setWanderLocationPlacement(null);
    setGroupingMode(null);
    setTool("select");
    setConnectionPlacement({connectionIndex, field});
  }

  function startUnitPlacement(unitIndex) {
    setPlacement(null);
    setConnectionPlacement(null);
    setPatrolStepPlacement(null);
    setWanderLocationPlacement(null);
    setGroupingMode(null);
    setTool("select");
    setUnitPlacement({unitIndex});
  }

  // Mirrors startBarrierPlacement exactly, for a patrol step's position.
  function startPatrolStepPlacement(unitIndex, stepIndex, mode = "insert") {
    setPlacement(null);
    setConnectionPlacement(null);
    setUnitPlacement(null);
    setWanderLocationPlacement(null);
    setGroupingMode(null);
    setTool("select");
    setPatrolStepPlacement({unitIndex, stepIndex, mode});
  }

  function startPatrolStepEdit(unitIndex, stepIndex) {
    startPatrolStepPlacement(unitIndex, stepIndex, "edit");
  }

  function startWanderLocationPlacement(unitIndex) {
    setPlacement(null);
    setConnectionPlacement(null);
    setUnitPlacement(null);
    setPatrolStepPlacement(null);
    setGroupingMode(null);
    setTool("select");
    setWanderLocationPlacement({unitIndex});
  }

  function focusUnitFromMap(unitIndex) {
    if (groupingMode) {
      toggleGroupMember(unitIndex);
      return;
    }
    setSelectedUnitIndex(unitIndex);
    unitFocusNonceRef.current += 1;
    setUnitFocusRequest({index: unitIndex, nonce: unitFocusNonceRef.current});
  }

  function startTool(nextTool) {
    setPlacement(null);
    setConnectionPlacement(null);
    setUnitPlacement(null);
    setPatrolStepPlacement(null);
    setWanderLocationPlacement(null);
    setGroupingMode(null);
    setTool(nextTool);
  }

  function startAddUnit(unitTypeKey) {
    setPendingUnitType(unitTypeKey);
    requestUnitTypeDetails(unitTypeKey);
    startTool("add-unit");
  }

  // Toggling the same group's button again turns grouping mode back off,
  // same as every other single-shot mode in this editor.
  function startGroupingMode(groupIdentifier) {
    setPlacement(null);
    setConnectionPlacement(null);
    setUnitPlacement(null);
    setPatrolStepPlacement(null);
    setWanderLocationPlacement(null);
    setTool("select");
    setGroupingMode((current) => (current?.groupIdentifier === groupIdentifier ? null : {groupIdentifier}));
  }

  function addPendingGroup(name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setPendingGroupNames((current) => (current.includes(trimmed) ? current : [...current, trimmed]));
    startGroupingMode(trimmed);
  }

  // The only way a unit's groupIdentifier ever changes - toggled by
  // clicking a unit (its map token, via focusUnitFromMap above, or its
  // UnitsPanel row) while grouping mode targets a group: already a member
  // -> clear it; not a member -> set it, silently moving the unit out of
  // whatever other group it was in.
  function toggleGroupMember(unitIndex) {
    if (!groupingMode) return;
    const unit = mapData.units[unitIndex];
    const target = groupingMode.groupIdentifier;
    const nextValue = unit.groupIdentifier === target ? null : target;
    dispatch({type: "UPDATE_ENTRY_FIELD", section: "units", index: unitIndex, field: "groupIdentifier", value: nextValue});
  }

  // Renaming a group rewrites every current member's groupIdentifier in one
  // batch of dispatches - the identifier *is* the group's identity, there's
  // no separate id to keep stable underneath.
  function renameGroup(oldName, newName) {
    mapData.units.forEach((unit, i) => {
      if (unit.groupIdentifier === oldName) {
        dispatch({type: "UPDATE_ENTRY_FIELD", section: "units", index: i, field: "groupIdentifier", value: newName});
      }
    });
    setPendingGroupNames((current) => current.map((name) => (name === oldName ? newName : name)));
    setGroupingMode((current) => (current?.groupIdentifier === oldName ? {groupIdentifier: newName} : current));
  }

  // Grouping mode's only cancel gesture is Escape or its own button again
  // (see startGroupingMode) - unlike the placement modes above, clicks
  // everywhere in the canvas and sidebar are meaningful membership toggles,
  // not "click outside to cancel" targets.
  useEffect(() => {
    if (!groupingMode) return;
    function onKeyDown(e) {
      if (e.key === "Escape") setGroupingMode(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [groupingMode]);

  // Starting a simulation clears every other mode first, same mutual-
  // exclusion convention as the rest of this editor - simulating is a
  // read-only preview, not something that coexists with an armed edit.
  function startSimulation() {
    setPlacement(null);
    setConnectionPlacement(null);
    setUnitPlacement(null);
    setPatrolStepPlacement(null);
    setWanderLocationPlacement(null);
    setGroupingMode(null);
    setTool("select");
    simUnitsRef.current = mapData.units.map(initSimUnit);
    setSimPositions(simUnitsRef.current.map((sim) => ({x: sim.x, y: sim.y, angle: sim.angle})));
    setSimulating(true);
  }

  function stopSimulation() {
    setSimulating(false);
    setSimPositions(null);
  }

  function toggleSimulation() {
    if (simulating) stopSimulation();
    else startSimulation();
  }

  // Drives simUnitsRef forward every animation frame while simulating, then
  // mirrors the positions into simPositions to trigger a render - real
  // elapsed time is clamped before scaling by simSpeed so a throttled/
  // backgrounded tab can't produce one huge catch-up jump when it resumes.
  useEffect(() => {
    if (!simulating) return;
    simLastTimeRef.current = performance.now();

    function frame(now) {
      const rawDt = Math.min((now - simLastTimeRef.current) / 1000, 0.05);
      simLastTimeRef.current = now;
      const dt = rawDt * simSpeed;
      simUnitsRef.current.forEach((sim, i) => {
        const unit = mapData.units[i];
        const speedFactor = unitTypeDetails[unit.unitType]?.speedFactor ?? 1.0;
        tickSimUnit(sim, unit, BASE_MOB_SPEED * speedFactor, dt);
      });
      setSimPositions(simUnitsRef.current.map((sim) => ({x: sim.x, y: sim.y, angle: sim.angle})));
      simRafRef.current = requestAnimationFrame(frame);
    }

    simRafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(simRafRef.current);
    // mapData.units/unitTypeDetails are read via closure each frame, not
    // re-subscribed to - editing is locked while simulating, so units can't
    // change out from under the loop; unitTypeDetails updating mid-sim
    // (a background fetch resolving) is harmless to pick up next frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulating, simSpeed]);

  // Lets a unit type or item created in another tab (via "+ New Unit
  // Type"/"+ New Item") show up in their dropdowns here without reloading
  // the whole editor and losing the draft - same pattern as
  // UnitTypeEditor's handleRefreshAbilities, but only re-fetches the
  // (cheap) key lists, not every unit type/item's details. One shared
  // button/status for both, since they're both "pick up what's new" in
  // the same gesture.
  async function handleRefresh() {
    setRefreshStatus("Refreshing…");
    try {
      const [unitTypeKeys, itemKeys] = await Promise.all([
        fetch(availableUnitTypesUrl).then((res) => {
          if (!res.ok) throw new Error(`request failed: ${res.status}`);
          return res.json();
        }),
        fetch(availableItemsUrl).then((res) => {
          if (!res.ok) throw new Error(`request failed: ${res.status}`);
          return res.json();
        }),
      ]);
      setAvailableUnitTypeKeys(unitTypeKeys);
      setAvailableItemKeys(itemKeys);
      setRefreshStatus("Refreshed.");
    } catch (error) {
      setRefreshStatus(`Refresh failed: ${error.message}`);
    }
  }

  // Fetches {name, tokenRadius, tokenImageUrl} for exactly the given keys
  // (skipping ones already cached) and merges them in - best-effort, since
  // a unit type that fails to resolve just keeps using UnitShapes' default
  // fallback marker rather than needing to surface an error here.
  async function fetchUnitTypeDetails(keys) {
    const missing = keys.filter((key) => !(key in unitTypeDetails));
    if (!availableUnitTypesUrl || missing.length === 0) return;
    try {
      const query = missing.map((key) => `keys[]=${encodeURIComponent(key)}`).join("&");
      const res = await fetch(`${availableUnitTypesUrl}?${query}`);
      if (!res.ok) return;
      const details = await res.json();
      setUnitTypeDetails((current) => ({...current, ...details}));
    } catch {
      // best-effort, see above
    }
  }

  function requestUnitTypeDetails(key) {
    if (key) fetchUnitTypeDetails([key]);
  }

  // Covers units already on the map whose type wasn't prefetched by #edit
  // (e.g. one this session just placed, or a map loaded without a full
  // server round-trip in a test) - requestUnitTypeDetails at placement time
  // handles the common case already, this is the backstop.
  useEffect(() => {
    const usedKeys = [...new Set(mapData.units.map((unit) => unit.unitType).filter(Boolean))];
    fetchUnitTypeDetails(usedKeys);
    // fetchUnitTypeDetails reads the latest unitTypeDetails/availableUnitTypesUrl
    // via closure each call; only re-run when the actual set of unitTypes in use changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapData.units]);

  // Same idea as fetchUnitTypeDetails, for items - {identifier, name, slot}.
  async function fetchItemDetails(keys) {
    const missing = keys.filter((key) => !(key in itemDetails));
    if (!availableItemsUrl || missing.length === 0) return;
    try {
      const query = missing.map((key) => `keys[]=${encodeURIComponent(key)}`).join("&");
      const res = await fetch(`${availableItemsUrl}?${query}`);
      if (!res.ok) return;
      const details = await res.json();
      setItemDetails((current) => ({...current, ...details}));
    } catch {
      // best-effort, see above
    }
  }

  function requestItemDetails(key) {
    if (key) fetchItemDetails([key]);
  }

  // Backstop covering loot table item identifiers not prefetched by #edit
  // (assumed to also be the item's file key - see
  // Build::MapsController#available_items) - same role as the unitType
  // effect above.
  useEffect(() => {
    const usedIdentifiers = [...new Set(mapData.units.flatMap((unit) => Object.keys(unit.lootTable ?? {})))];
    fetchItemDetails(usedIdentifiers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapData.units]);

  // "insert" mode splices the clicked feet position in at pointIndex, then
  // advances to the gap right after it - a run of map clicks lays down
  // consecutive points. "edit" mode replaces the existing point at
  // pointIndex and exits immediately. Nothing is ever written for a point
  // that hasn't been placed/edited yet, so canceling (see MapCanvas) is
  // just clearing this state, no cleanup needed.
  function placePoint(feet) {
    const {barrierIndex, pointIndex, mode} = placement;
    const locations = mapData.barriers[barrierIndex].locations;

    if (mode === "edit") {
      const nextLocations = locations.map((loc, i) => (i === pointIndex ? feet : loc));
      dispatch({type: "UPDATE_ENTRY_FIELD", section: "barriers", index: barrierIndex, field: "locations", value: nextLocations});
      setPlacement(null);
      return;
    }

    const nextLocations = [...locations.slice(0, pointIndex), feet, ...locations.slice(pointIndex)];
    dispatch({type: "UPDATE_ENTRY_FIELD", section: "barriers", index: barrierIndex, field: "locations", value: nextLocations});
    setPlacement({barrierIndex, pointIndex: pointIndex + 1, mode: "insert"});
  }

  // Single-shot, unlike placePoint above - re-placing one already-existing
  // connection field (position/start/end) sets it and exits, no advancing
  // to a next gap.
  function placeConnectionField(feet) {
    const {connectionIndex, field} = connectionPlacement;
    if (field === "position") {
      const current = mapData.connections[connectionIndex].position;
      dispatch({type: "UPDATE_ENTRY_FIELD", section: "connections", index: connectionIndex, field: "position", value: {...current, x: feet.x, y: feet.y}});
    } else {
      dispatch({type: "UPDATE_ENTRY_FIELD", section: "connections", index: connectionIndex, field, value: feet});
    }
    setConnectionPlacement(null);
  }

  // Single-shot, like placeConnectionField above - keeps the unit's facing
  // angle, only replaces x/y.
  function placeUnitPosition(feet) {
    const {unitIndex} = unitPlacement;
    const current = mapData.units[unitIndex].position;
    dispatch({type: "UPDATE_ENTRY_FIELD", section: "units", index: unitIndex, field: "position", value: {...current, x: feet.x, y: feet.y}});
    setUnitPlacement(null);
  }

  // `movement` is a single nested object (like `position`/`lootTable`), so
  // every field change here dispatches the whole updated object rather than
  // a deep-path update - same convention as those.
  function updateMovement(unitIndex, fields) {
    const current = mapData.units[unitIndex].movement ?? {type: "still"};
    dispatch({type: "UPDATE_ENTRY_FIELD", section: "units", index: unitIndex, field: "movement", value: {...current, ...fields}});
  }

  // "insert" mode appends a new step at stepIndex and advances to
  // stepIndex+1 on each click - same auto-advancing run-of-clicks pattern
  // as placePoint (wall points) above. "edit" mode replaces the existing
  // step's position (keeping its movementRate/waitTime) and exits.
  function placePatrolStep(feet) {
    const {unitIndex, stepIndex, mode} = patrolStepPlacement;
    const steps = mapData.units[unitIndex].movement.steps;

    if (mode === "edit") {
      const nextSteps = steps.map((step, i) => (i === stepIndex ? {...step, position: {x: feet.x, y: feet.y, angle: 0}} : step));
      updateMovement(unitIndex, {steps: nextSteps});
      setPatrolStepPlacement(null);
      return;
    }

    const newStep = {position: {x: feet.x, y: feet.y, angle: 0}, movementRate: 0.5, waitTime: 1};
    const nextSteps = [...steps.slice(0, stepIndex), newStep, ...steps.slice(stepIndex)];
    updateMovement(unitIndex, {steps: nextSteps});
    setPatrolStepPlacement({unitIndex, stepIndex: stepIndex + 1, mode: "insert"});
  }

  // Single-shot, like placeConnectionField/placeUnitPosition above.
  function placeWanderLocation(feet) {
    const {unitIndex} = wanderLocationPlacement;
    updateMovement(unitIndex, {location: {x: feet.x, y: feet.y}});
    setWanderLocationPlacement(null);
  }

  // pixelDimensions is derived, not authored - keep the draft in sync with
  // whatever image is actually loaded (a freshly uploaded file's natural
  // size overrides whatever the map's JSON said before).
  useEffect(() => {
    if (image) dispatch({type: "SET_FIELD", field: "pixelDimensions", value: image.pixelDimensions});
  }, [image]);

  function handleImageFile(file) {
    setImageError("");

    if (!file.type.startsWith("image/")) {
      setImageError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      const mb = (bytes) => (bytes / (1024 * 1024)).toFixed(1);
      setImageError(`Image must be under ${mb(MAX_IMAGE_BYTES)}MB (this one is ${mb(file.size)}MB).`);
      return;
    }

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImage((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return {file, url, pixelDimensions: {width: img.naturalWidth, height: img.naturalHeight}};
      });
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
  const effectiveMapData = simulating && simPositions
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
        imageError={imageError}
        onImageFile={handleImageFile}
        backUrl={backUrl}
        mapData={effectiveMapData}
        dispatch={dispatch}
        selectedBarrierIndex={selectedBarrierIndex}
        onSelectBarrier={setSelectedBarrierIndex}
        hoveredBarrierIndex={hoveredBarrierIndex}
        hoveredPoint={hoveredPoint}
        placement={placement}
        onPlacePoint={placePoint}
        onCancelPlacement={() => setPlacement(null)}
        selectedConnectionIndex={selectedConnectionIndex}
        onSelectConnection={setSelectedConnectionIndex}
        hoveredConnectionIndex={hoveredConnectionIndex}
        connectionPlacement={connectionPlacement}
        onPlaceConnectionField={placeConnectionField}
        onCancelConnectionPlacement={() => setConnectionPlacement(null)}
        selectedUnitIndex={selectedUnitIndex}
        onSelectUnit={focusUnitFromMap}
        hoveredUnitIndex={hoveredUnitIndex}
        onHoverUnit={setHoveredUnitIndex}
        pendingUnitType={pendingUnitType}
        availableUnitTypes={unitTypeDetails}
        unitPlacement={unitPlacement}
        onPlaceUnitPosition={placeUnitPosition}
        onCancelUnitPlacement={() => setUnitPlacement(null)}
        patrolStepPlacement={patrolStepPlacement}
        onPlacePatrolStep={placePatrolStep}
        onCancelPatrolStepPlacement={() => setPatrolStepPlacement(null)}
        wanderLocationPlacement={wanderLocationPlacement}
        onPlaceWanderLocation={placeWanderLocation}
        onCancelWanderLocationPlacement={() => setWanderLocationPlacement(null)}
        hoveredPatrolStep={hoveredPatrolStep}
        expandedUnitIndices={expandedUnitIndices}
        groupingMode={groupingMode}
        onToggleGroupMember={toggleGroupMember}
        hoveredGroupIdentifier={hoveredGroupIdentifier}
        simulating={simulating}
        onToggleSimulate={toggleSimulation}
        simSpeed={simSpeed}
        onSimSpeedChange={setSimSpeed}
        tool={tool}
        onToolChange={setTool}
      />
      <MapSidebar>
        {simulating ? (
          <div className="map-sidebar-section-heading map-simulate-notice">
            <h3>Simulating units - editing is disabled while this runs.</h3>
          </div>
        ) : (
          <>
            <MapFieldsPanel mapData={mapData} pixelDimensions={image?.pixelDimensions} dispatch={dispatch} />
            <BarriersPanel
              barriers={mapData.barriers}
              selectedIndex={selectedBarrierIndex}
              onSelect={setSelectedBarrierIndex}
              onHover={setHoveredBarrierIndex}
              onHoverPoint={setHoveredPoint}
              placement={placement}
              onStartPlacement={startBarrierPlacement}
              onStartPointEdit={startBarrierPointEdit}
              tool={tool}
              onStartAddCircle={() => startTool("add-circle")}
              canPlaceOnMap={canPlaceOnMap}
              otherPlacementActive={!!connectionPlacement}
              dispatch={dispatch}
            />
            <ConnectionsPanel
              connections={mapData.connections}
              selectedIndex={selectedConnectionIndex}
              onSelect={setSelectedConnectionIndex}
              onHover={setHoveredConnectionIndex}
              tool={tool}
              placement={placement}
              canPlaceOnMap={canPlaceOnMap}
              connectionPlacement={connectionPlacement}
              onStartConnectionPlacement={startConnectionFieldPlacement}
              onStartAddPointConnection={() => startTool("add-point-connection")}
              onStartAddLineConnection={() => startTool("add-line-connection")}
              dispatch={dispatch}
            />
            <UnitsPanel
              units={mapData.units}
              selectedIndex={selectedUnitIndex}
              onSelect={setSelectedUnitIndex}
              onHover={setHoveredUnitIndex}
              hoveredIndex={hoveredUnitIndex}
              focusUnitRequest={unitFocusRequest}
              availableUnitTypeKeys={availableUnitTypeKeys}
              unitTypeDetails={unitTypeDetails}
              onChooseUnitType={requestUnitTypeDetails}
              newUnitTypeUrl={newUnitTypeUrl}
              availableItemKeys={availableItemKeys}
              itemDetails={itemDetails}
              onChooseItem={requestItemDetails}
              newItemUrl={newItemUrl}
              onRefresh={handleRefresh}
              refreshStatus={refreshStatus}
              tool={tool}
              placement={placement}
              canPlaceOnMap={canPlaceOnMap}
              pendingUnitType={pendingUnitType}
              onStartAddUnit={startAddUnit}
              unitPlacement={unitPlacement}
              onStartUnitPlacement={startUnitPlacement}
              patrolStepPlacement={patrolStepPlacement}
              onStartPatrolStepPlacement={startPatrolStepPlacement}
              onStartPatrolStepEdit={startPatrolStepEdit}
              wanderLocationPlacement={wanderLocationPlacement}
              onStartWanderLocationPlacement={startWanderLocationPlacement}
              onUpdateMovement={updateMovement}
              onHoverPatrolStep={setHoveredPatrolStep}
              onExpandedIndicesChange={setExpandedUnitIndices}
              groupingMode={groupingMode}
              onStartGroupingMode={startGroupingMode}
              onToggleGroupMember={toggleGroupMember}
              hoveredGroupIdentifier={hoveredGroupIdentifier}
              onHoverGroup={setHoveredGroupIdentifier}
              pendingGroupNames={pendingGroupNames}
              onAddPendingGroup={addPendingGroup}
              onRenameGroup={renameGroup}
              dispatch={dispatch}
            />
          </>
        )}
      </MapSidebar>
    </div>
  );
}
