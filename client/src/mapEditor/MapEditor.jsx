import {useEffect, useReducer, useState} from "react";
import MapCanvas from "./MapCanvas";
import MapSidebar from "./MapSidebar";
import MapFieldsPanel from "./MapFieldsPanel";
import BarriersPanel from "./BarriersPanel";
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
  const [placement, setPlacement] = useState(null); // {barrierIndex, insertIndex} | null - see MapCanvas/BarriersPanel
  const [tool, setTool] = useState("select"); // "select" | "add-circle" - see MapCanvas/BarriersPanel

  // Inserts the clicked feet position into the placement's barrier/index,
  // then advances to the gap right after it - a run of map clicks lays
  // down consecutive points. Nothing is ever written for a point that
  // hasn't been placed yet, so canceling (see MapCanvas) is just clearing
  // this state, no cleanup needed.
  function placePoint(feet) {
    const {barrierIndex, insertIndex} = placement;
    const locations = mapData.barriers[barrierIndex].locations;
    const nextLocations = [...locations.slice(0, insertIndex), feet, ...locations.slice(insertIndex)];
    dispatch({type: "UPDATE_ENTRY_FIELD", section: "barriers", index: barrierIndex, field: "locations", value: nextLocations});
    setPlacement({barrierIndex, insertIndex: insertIndex + 1});
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
          onStartPlacement={(barrierIndex, insertIndex) => setPlacement({barrierIndex, insertIndex})}
          tool={tool}
          onStartAddCircle={() => setTool("add-circle")}
          dispatch={dispatch}
        />
      </MapSidebar>
    </div>
  );
}
