import {useState} from "react";
import MapWorkbench from "../../mapEditor/MapWorkbench";
import ContentAdder from "./ContentAdder";
import EditModal from "./EditModal";
import UnitTypeLevel from "./UnitTypeLevel";
import ItemLevel from "./ItemLevel";
import {createUnitType, unitTypeData} from "../state/unitTypeOps";
import {createItem, itemData} from "../state/itemOps";
import {libraryItems, libraryUnitTypes, prepareItemImport, prepareUnitTypeImport} from "../state/importing";
import {generateThumbnail} from "../../content/generateThumbnail";
import {mapData, ncuTokenUrls, removeMapImage, setMapImage, setMapThumbnail, updateMap, worldItems, worldUnitTypes} from "../state/mapOps";
import {inMemory, newAssetPath, tokenImageOptions} from "../state/assetOps";
import {mapFile, relativePath, resolvePath} from "../state/worldPaths";
import {assetUrlFor} from "../state/assetUrls";
import {createQuest, ncuQuests, newQuestIdentifier, questData} from "../state/questOps";
import {ncuDialogueLayout, setNcuDialogueLayout} from "../state/zoneOps";
import {libraryStampSets, prepareStampSetImport, stampSheetPath, zoneStamps} from "../state/stampOps";
import ImportForm from "./ImportForm";

// The map level: the map editor's whole editing surface (MapWorkbench)
// over one map's part of the live draft. Units can be any of the world's
// own unit types, and drop the world's own items - either of which can be
// imported or created on the spot (a created one opens in an EditModal
// first). Uploaded backgrounds (and their thumbnails) go into the draft
// like any other change. Each NCU's quests are listed and badged, opening
// the quest editor (onOpenQuest).
export default function MapLevel({draft, zone, map, onChange, repo, stockAssets, library, onOpenQuest}) {
  // A unit type or item just created while placing units, open for
  // editing: {kind, key, done} - done uses it (palette, loot table).
  const [editing, setEditing] = useState(null);
  const data = mapData(draft, zone, map);
  const path = mapFile(draft.worldKey, zone, map);
  const assetUrl = (repoPath) => assetUrlFor(draft, repo, repoPath);
  const {keys: unitTypeKeys, details: unitTypeDetails} = worldUnitTypes(draft, assetUrl);
  const {keys: itemKeys, details: itemDetails} = worldItems(draft);
  const stampSets = zoneStamps(draft, zone).sets;
  const stamps = {
    sets: stampSets,
    sheetUrl: (set) => {
      const sheet = stampSheetPath(draft, zone, set);
      return sheet ? assetUrl(sheet) : "";
    },
  };
  const named = (identifiers) => identifiers.map((identifier) => ({identifier, name: questData(draft, identifier)?.name || identifier}));
  const questsOf = (ncu) => {
    const {offers, turnIns} = ncuQuests(draft, zone, ncu);
    return {offers: named(offers), turnIns: named(turnIns)};
  };
  const ncuQuestProps = onOpenQuest && {
    byNcu: Object.fromEntries((data.ncus ?? []).filter((ncu) => ncu.identifier).map((ncu) => [ncu.identifier, questsOf(ncu.identifier)])),
    onOpenQuest,
    dialogueLayout: {
      get: (ncu) => ncuDialogueLayout(draft, zone, ncu),
      set: (ncu, layout) => onChange((current) => setNcuDialogueLayout(current, zone, ncu, layout)),
    },
    onNewQuest: (ncu) => {
      const identifier = newQuestIdentifier(draft, ncu);
      onChange(createQuest(draft, identifier, {zone, ncu}));
      onOpenQuest(identifier);
    },
  };

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
        onImageRemove={() => onChange((current) => removeMapImage(current, zone, map))}
        onCellThumbnail={(thumbnail) => onChange((current) => setMapThumbnail(current, zone, map, thumbnail))}
        unitTypes={{keys: unitTypeKeys, details: unitTypeDetails}}
        items={{keys: itemKeys, details: itemDetails}}
        ncuTokenUrls={ncuTokenUrls(draft, zone, map, assetUrl)}
        tokenImages={{options: tokenImageOptions(draft, path, assetUrl), upload: uploadTokenImage}}
        ncuQuests={ncuQuestProps}
        stamps={stamps}
        renderStampSetAdder={library && (({close}) => (
          <ImportForm
            noun="stamp set" draft={draft} library={library} list={libraryStampSets}
            prepare={(current, reader, sourcePath, key) => prepareStampSetImport(current, reader, zone, sourcePath, key)}
            onChange={onChange} onImported={close} onCancel={close}
          />
        ))}
        renderUnitTypeAdder={({onAdded, close}) => (
          <ContentAdder
            noun="unit type" draft={draft} library={library} list={libraryUnitTypes} prepare={prepareUnitTypeImport} create={createUnitType}
            onChange={onChange} onAdded={onAdded}
            onCreated={(key) => {
              close();
              setEditing({kind: "unitType", key, done: () => onAdded(key)});
            }}
          />
        )}
        renderItemAdder={({onAdded, close}) => (
          <ContentAdder
            noun="item" draft={draft} library={library} list={libraryItems} prepare={prepareItemImport} create={createItem}
            onChange={onChange} onAdded={onAdded}
            onCreated={(key) => {
              close();
              setEditing({kind: "item", key, done: () => onAdded(key)});
            }}
          />
        )}
      />
      {editing && (
        <EditModal
          title={editing.kind === "item" ? `Item: ${itemData(draft, editing.key)?.name || editing.key}` : `Unit type: ${unitTypeData(draft, editing.key)?.name || editing.key}`}
          label={`Edit ${editing.kind === "item" ? "item" : "unit type"} ${editing.key}`}
          onDone={() => {
            editing.done();
            setEditing(null);
          }}
        >
          {editing.kind === "item"
            ? <ItemLevel draft={draft} item={editing.key} onChange={onChange} repo={repo} />
            : <UnitTypeLevel draft={draft} unitType={editing.key} onChange={onChange} repo={repo} stockAssets={stockAssets} library={library} />}
        </EditModal>
      )}
    </div>
  );
}
