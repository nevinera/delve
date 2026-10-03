import {useState} from "react";
import MapWorkbench from "../../mapEditor/MapWorkbench";
import UnitTypeAdder from "./UnitTypeAdder";
import UnitTypeModal from "./UnitTypeModal";
import {generateThumbnail} from "../../content/generateThumbnail";
import {mapData, ncuTokenUrls, setMapImage, updateMap, worldItems, worldUnitTypes} from "../state/mapOps";
import {inMemory, newAssetPath, tokenImageOptions} from "../state/assetOps";
import {mapFile, relativePath, resolvePath} from "../state/worldPaths";
import {assetUrlFor} from "../state/assetUrls";

// The map level: the map editor's whole editing surface (MapWorkbench)
// over one map's part of the live draft. Units can be any of the world's
// own unit types, and drop the world's own items. Uploaded backgrounds
// (and their thumbnails) go into the draft like any other change.
export default function MapLevel({draft, zone, map, onChange, repo, stockAssets, library}) {
  // A unit type just created from the Units tab, open for editing, and
  // what to do once that's done (put it in the palette).
  const [editingUnitType, setEditingUnitType] = useState(null);
  const data = mapData(draft, zone, map);
  const path = mapFile(draft.worldKey, zone, map);
  const assetUrl = (repoPath) => assetUrlFor(draft, repo, repoPath);
  const {keys: unitTypeKeys, details: unitTypeDetails} = worldUnitTypes(draft, assetUrl);
  const {keys: itemKeys, details: itemDetails} = worldItems(draft);

  // The workbench hands over the picked file, then (in the same gesture)
  // sets imageUrl/pixelDimensions on the map. The file goes into the draft
  // right away, under that name; its thumbnail follows once it's made.
  // The background it replaces is noted now, before imageUrl changes.
  function handleImageUpload(file, name) {
    const previous = data.imageUrl;
    onChange((current) => setMapImage(current, zone, map, {file, name, previous}));
    generateThumbnail(file, data.feetDimensions)
      .then((thumbnail) => thumbnail && onChange((current) => setMapImage(current, zone, map, {file, name, thumbnail})))
      .catch(() => {});
  }

  // An uploaded NCU token goes into the draft, under tokens/ncu/.
  async function uploadTokenImage(file) {
    const blob = await inMemory(file);
    const target = newAssetPath(draft, "tokens/ncu", file.name);
    onChange((current) => current.write(target, blob));
    return relativePath(path, target);
  }

  return (
    <div className="map-level">
      <MapWorkbench
        key={`${zone}/${map}@${draft.snapshot.commitSha}`}
        mapKey={map}
        mapData={data}
        onMapChange={(fn) => onChange((current) => updateMap(current, zone, map, fn))}
        imageUrl={data.imageUrl ? assetUrl(resolvePath(path, data.imageUrl)) : null}
        onImageUpload={handleImageUpload}
        unitTypes={{keys: unitTypeKeys, details: unitTypeDetails}}
        items={{keys: itemKeys, details: itemDetails}}
        ncuTokenUrls={ncuTokenUrls(draft, zone, map, assetUrl)}
        tokenImages={{options: tokenImageOptions(draft, path, assetUrl), upload: uploadTokenImage}}
        renderUnitTypeAdder={({onAdded, close}) => (
          <UnitTypeAdder
            draft={draft} library={library} onChange={onChange} onAdded={onAdded}
            onCreated={(key) => {
              close();
              setEditingUnitType({key, done: () => onAdded(key)});
            }}
          />
        )}
      />
      {editingUnitType && (
        <UnitTypeModal
          draft={draft} unitType={editingUnitType.key} onChange={onChange} repo={repo} stockAssets={stockAssets} library={library}
          onDone={() => {
            editingUnitType.done();
            setEditingUnitType(null);
          }}
        />
      )}
    </div>
  );
}
