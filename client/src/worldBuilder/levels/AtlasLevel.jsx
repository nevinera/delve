import {useMemo, useState} from "react";
import AtlasCanvas, {zoneColor} from "../../worldEditor/AtlasCanvas";
import {atlasData, atlasInput, atlasSizes, atlasThumbnails, resetAtlas, setAtlas} from "../state/atlasOps";
import {atlasLinks} from "../../worldEditor/atlasLayout";
import {atlasProblems} from "../../worldEditor/atlasGeometry";
import {assetUrlFor} from "../state/assetUrls";
import {worldData} from "../state/worldOps";

// The world's atlas (docs/schema/world.md#atlas, plans/map-layout.md):
// where its maps sit geographically, for the in-game map. The canvas
// (left) to arrange it; on the right, a fresh guess, what isn't laid out
// yet, and anything the server would refuse.
export default function AtlasLevel({draft, onChange, navigate, repo}) {
  const atlas = atlasData(draft);
  const [editing, setEditing] = useState(true);
  const input = useMemo(() => atlasInput(draft), [draft]);
  const sizes = useMemo(() => atlasSizes(input), [input]);
  const thumbnails = useMemo(() => {
    const paths = atlasThumbnails(draft);
    return Object.fromEntries(Object.entries(paths).map(([zone, maps]) => [zone, Object.fromEntries(Object.entries(maps).map(([map, path]) => [map, assetUrlFor(draft, repo, path)]))]));
  }, [draft, repo]);
  const world = worldData(draft) ?? {};
  const zoneNames = Object.fromEntries(Object.entries(world.zones ?? {}).map(([key, entry]) => [key, entry.name || key]));
  const mapNames = Object.fromEntries(Object.entries(input.zones).map(([zone, {maps}]) => [zone, Object.fromEntries(maps.map((m) => [m.identifier, m.name || m.identifier]))]));
  const problems = atlas ? atlasProblems(atlas, sizes) : [];

  const unplaced = Object.entries(input.zones).flatMap(([zone, {maps}]) => {
    if (!atlas?.zones?.[zone]) return [{zone, text: `${zoneNames[zone]} (the whole zone)`}];
    return maps.filter((m) => !atlas.zones[zone].maps?.[m.identifier]).map((m) => ({zone, text: `${zoneNames[zone]}: ${mapNames[zone][m.identifier]}`}));
  });

  // As the canvas colors them: by their order in the atlas.
  const badgeColor = (zone) => {
    const index = Object.keys(atlas?.zones ?? {}).indexOf(zone);
    return index === -1 ? "#556" : zoneColor(index);
  };

  function onReset() {
    if (atlas && !window.confirm("Replace the atlas with a fresh guess? Nothing is committed until you save.")) return;
    onChange(resetAtlas(draft));
  }

  return (
    <>
      <div className="content-editor-left">
        <div className="content-editor-preview">
          <AtlasCanvas
            key={`${draft.snapshot.commitSha}/${atlas ? "atlas" : "none"}`}
            atlas={atlas}
            sizes={sizes}
            zoneNames={zoneNames}
            mapNames={mapNames}
            thumbnails={thumbnails}
            linksFor={(shown) => atlasLinks(shown, input)}
            onChange={(next) => onChange((current) => setAtlas(current, next))}
            onOpenMap={(zone, map) => navigate({zone, map})}
            editable={editing}
          />
        </div>
      </div>
      <div className="content-editor-fields fields-pane">
        <h3>Atlas</h3>
        <p className="world-key">
          Where each zone&apos;s maps sit, north up and to scale, for the in-game map. Drag a map, a zone, or a zone&apos;s corners;
          drag the middle of an outline&apos;s edge to add a corner there, and double-click a corner (or drop it on the next one) to remove it. Drag a link&apos;s dot
          to bend it, and double-click the dot to straighten it. Double-click a map to open it.
        </p>
        <button type="button" className="add-entry" onClick={onReset}>{atlas ? "Reset atlas" : "Guess atlas"}</button>
        <label className="atlas-editing">
          <input type="checkbox" checked={editing} onChange={(e) => setEditing(e.target.checked)} />
          {" "}Edit (off: as the in-game map shows it, with everything explored)
        </label>
        <section className="content-list">
          <h4>Zones</h4>
          <ul className="atlas-zones">
            {Object.keys(input.zones).map((zone) => (
              <li key={zone}><span className="quest-chain-badge" style={{background: badgeColor(zone)}} /> {zoneNames[zone]}</li>
            ))}
          </ul>
        </section>
        {unplaced.length > 0 && (
          <section className="content-list">
            <h4>Not laid out</h4>
            <ul>{unplaced.map((u) => <li key={u.text}>{u.text}</li>)}</ul>
            <p className="world-key">Reset the atlas to lay them out (it replaces the whole layout).</p>
          </section>
        )}
        {problems.length > 0 && (
          <section className="content-list">
            <h4>Problems</h4>
            <ul className="atlas-problems">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
          </section>
        )}
      </div>
    </>
  );
}
