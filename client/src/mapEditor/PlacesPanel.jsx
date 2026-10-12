import {useEffect, useRef} from "react";
import {placeColor} from "./PlaceShapes";
import AnnotationsSection from "../annotations/AnnotationsSection";

// The Places tab's list: each of the map's places (see docs/schema/map.md
// #place) with its name, description and tags, to read, and its
// annotations, to edit (onAnnotate(index, annotations)). Places are written
// by the generator, Auto Barriers (Map tab) and tooling, not here.
// Selecting one (here or on the map) opens it.
export default function PlacesPanel({places, selectedIndex, onSelect, onHover, onAnnotate}) {
  const selectedRef = useRef(null);
  useEffect(() => {
    selectedRef.current?.scrollIntoView?.({block: "nearest"});
  }, [selectedIndex]);

  return (
    <>
      <div className="map-sidebar-section-heading">
        <h3>Places{places.length > 0 ? ` (${places.length})` : ""}</h3>
      </div>
      {places.length === 0 && (
        <p className="map-editor-sidebar-placeholder">
          No places yet. A generated cell map has them; Auto Barriers (Map tab) adds them to the map.
        </p>
      )}
      {places.map((place, i) => {
        const open = selectedIndex === i;
        const annotated = Object.keys(place.annotations ?? {}).length > 0;
        return (
          <div
            key={place.identifier} ref={open ? selectedRef : null}
            className={`entry-block map-place-entry${open ? " map-entry-selected map-entry-expanded" : ""}`}
            onMouseEnter={() => onHover(i)} onMouseLeave={() => onHover(null)}
          >
            <div className="entry-heading-row" onClick={() => onSelect(open ? null : i)}>
              <div className="map-row-summary">
                <span className="map-sidebar-section-toggle">{open ? "▾" : "▸"}</span>
                <span className="map-place-swatch" style={{background: placeColor(i, 0.9)}} />
                <h3>
                  {place.name ?? place.identifier}
                  {place.name && <span className="map-entry-summary"> ({place.identifier})</span>}
                </h3>
              </div>
            </div>
            {open && (
              <div className="map-place-details">
                {place.tags?.length > 0 && (
                  <div className="map-place-tags">{place.tags.map((tag) => <span key={tag} className="map-place-tag">{tag}</span>)}</div>
                )}
                {place.description && <p className="map-place-description">{place.description}</p>}
                <AnnotationsSection annotations={place.annotations} onChange={(v) => onAnnotate(i, v)} />
                {!place.tags?.length && !place.description && !annotated && (
                  <p className="map-sidebar-hint">No tags, description or annotations.</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
