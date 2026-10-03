import {WorldDraft as WorldFile} from "../../worldEditor/WorldDraft";
import WorldGraphCanvas from "../../worldEditor/WorldGraphCanvas";
import WorldFieldsPanel from "../../worldEditor/WorldFieldsPanel";
import WorldLinksPanel from "../../worldEditor/WorldLinksPanel";
import EntryPointsPanel from "../../worldEditor/EntryPointsPanel";
import {generateThumbnail} from "../../content/generateThumbnail";
import {setWorldPositions, setWorldThumbnail, worldData, worldPositions, zoneDetails} from "../state/worldOps";
import {worldFile} from "../state/worldPaths";
import {assetUrlFor} from "../state/assetUrls";
import ZoneList from "./ZoneList";
import UnitTypeList from "./UnitTypeList";

// The world level: graph (top-left), world attributes (bottom-left),
// zones, unit types, links and entry points (right). The old world editor's panels
// are reused as-is - they take the old per-file WorldDraft class, so they
// get one wrapping the world file's current data, and whatever they hand
// back is written straight into the live draft.
export default function WorldLevel({draft, onChange, navigate, repo, library}) {
  const worldPath = worldFile(draft.worldKey);
  const file = new WorldFile(worldData(draft));
  const onFileChange = (next) => onChange(draft.write(worldPath, next.data));
  const details = zoneDetails(draft);
  const thumbnailPath = file.data.thumbnailUrl ? `worlds/${draft.worldKey}/${file.data.thumbnailUrl}` : null;

  async function uploadThumbnail(upload) {
    const thumbnail = await generateThumbnail(upload);
    const extension = thumbnail ? "webp" : (upload.name.split(".").pop() || "png");
    onChange(setWorldThumbnail(draft, thumbnail ?? upload, extension));
  }

  return (
    <>
      <div className="content-editor-left">
        <div className="content-editor-preview">
          <WorldGraphCanvas
            key={draft.snapshot.commitSha}
            draft={file}
            onChange={onFileChange}
            zoneDetailsByKey={details}
            initialPositions={worldPositions(draft)}
            onPositionsChange={(positions) => onChange((current) => setWorldPositions(current, positions))}
            onOpenNode={(zone) => navigate({zone})}
          />
        </div>
        <div className="world-attributes">
          <h3>World</h3>
          <p className="world-key">Identifier: <code>{draft.worldKey}</code></p>
          <WorldFieldsPanel
            draft={file}
            onChange={onFileChange}
            thumbnailPreviewUrl={thumbnailPath ? assetUrlFor(draft, repo, thumbnailPath) : null}
            onUploadThumbnail={uploadThumbnail}
          />
        </div>
      </div>
      <div className="content-editor-fields">
        <ZoneList draft={draft} onChange={onChange} onOpen={(zone) => navigate({zone})} />
        <UnitTypeList draft={draft} onChange={onChange} onOpen={(unitType) => navigate({unitType})} repo={repo} library={library} />
        <WorldLinksPanel draft={file} onChange={onFileChange} zoneDetailsByKey={details} />
        <EntryPointsPanel draft={file} onChange={onFileChange} zoneDetailsByKey={details} />
      </div>
    </>
  );
}
