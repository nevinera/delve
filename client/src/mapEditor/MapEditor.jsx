import {useEffect, useReducer, useState} from "react";
import MapCanvas from "./MapCanvas";
import MapSidebar from "./MapSidebar";
import MapFieldsPanel from "./MapFieldsPanel";
import BarriersPanel from "./BarriersPanel";
import ConnectionsPanel from "./ConnectionsPanel";
import {mapReducer} from "./mapReducer";

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

export default function MapEditor({mapKey, initialMap, initialImageDataUri, initialPixelDimensions, backUrl}) {
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
  // "select" | "add-circle" | "add-point-connection" | "add-line-connection" - see MapCanvas/BarriersPanel/ConnectionsPanel
  const [tool, setTool] = useState("select");
  const canPlaceOnMap = Boolean(mapData.feetDimensions?.width && mapData.feetDimensions?.height);

  // At most one of {wall-point placement, connection-field placement, an
  // armed add-tool} is ever active - starting one cancels the others,
  // rather than every trigger needing to know about every other mode.
  function startBarrierPlacement(barrierIndex, pointIndex, mode = "insert") {
    setConnectionPlacement(null);
    setTool("select");
    setPlacement({barrierIndex, pointIndex, mode});
  }

  function startBarrierPointEdit(barrierIndex, pointIndex) {
    startBarrierPlacement(barrierIndex, pointIndex, "edit");
  }

  function startConnectionFieldPlacement(connectionIndex, field) {
    setPlacement(null);
    setTool("select");
    setConnectionPlacement({connectionIndex, field});
  }

  function startTool(nextTool) {
    setPlacement(null);
    setConnectionPlacement(null);
    setTool(nextTool);
  }

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

  return (
    <div className="map-editor" data-map-key={mapKey}>
      <MapCanvas
        image={image}
        imageError={imageError}
        onImageFile={handleImageFile}
        backUrl={backUrl}
        mapData={mapData}
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
        tool={tool}
        onToolChange={setTool}
      />
      <MapSidebar>
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
      </MapSidebar>
    </div>
  );
}
