import {useRef, useState, useEffect} from "react";
import {WorldDraft} from "./WorldDraft";
import {loadWorld, loadLayoutPositions, zoneDetailsFor, listAvailableZoneKeys, zoneRefPath} from "./worldContentLoaders";
import WorldGraphCanvas from "./WorldGraphCanvas";
import WorldFieldsPanel from "./WorldFieldsPanel";
import ZonesPanel from "./ZonesPanel";
import WorldLinksPanel from "./WorldLinksPanel";
import EntryPointsPanel from "./EntryPointsPanel";
import {saveWorld} from "./saveWorld";
import {validateWorld} from "../validators/validateContent";
import {useValidateThenSave} from "../validators/useValidateThenSave";
import ValidateSaveBar from "../validators/ValidateSaveBar";
import {GithubClient, GithubAuthError} from "../github/delve-github";

// A world lives at worlds/<key>.json (see Build::WorldsController) - flat,
// no subdirectory, and never inlines its zones (see docs/schema/world.md),
// so unlike the zone editor there's no $ref resolution step and no
// .full.json companion at all.
//
// Same draft-class shape every other editor uses now (see
// plans/editors-as-classes.md): WorldDraft owns the data and every
// mutation, this component just holds "the current instance" and replaces
// it wholesale via setDraft.
//
// Two independent cheap/expensive read pairs, same split ZoneEditor makes
// for maps one level down:
//   - availableZoneKeys: a cheap tree-listing of every zone that actually
//     exists under zones/ (see worldContentLoaders.js#listAvailableZoneKeys) -
//     a zone key can't be typed by hand and guessed right, so this is what
//     ZonesPanel's "Add Zone" picker offers candidates from.
//   - zoneDetailsByKey: {name, description, openConnections, entryPoints}
//     for every zone this world's draft actually references, fetched from
//     each zone's own file - lets the graph (WorldGraphCanvas) draw a real
//     port per exposed connection instead of a free-typed name, and its
//     name/description get synced into the draft's own cached
//     WorldZoneEntry (see WorldDraft#syncZoneDetails) rather than typed by
//     hand (see ZonesPanel).
// Both are fetched once on mount and again on demand (their own Refresh
// buttons) rather than on every keystroke/render.
export default function WorldEditor({worldKey, newZoneUrl}) {
  const [draft, setDraft] = useState(null);
  const [availableZoneKeys, setAvailableZoneKeys] = useState([]);
  const [zoneListRefreshStatus, setZoneListRefreshStatus] = useState("");
  const [zoneDetailsByKey, setZoneDetailsByKey] = useState({});
  const [connectionsRefreshStatus, setConnectionsRefreshStatus] = useState("");
  const [loadError, setLoadError] = useState(null);
  // The graph's own live drag-override map (see WorldGraphCanvas's
  // onPositionsChange/initialPositions) - tracked here without
  // WorldGraphCanvas needing to know anything about persistence itself,
  // same split ZoneEditor makes for its own graphPositions.
  const [graphPositions, setGraphPositions] = useState({});
  const {validity, activity, markDirty, setValidating, setValid, setInvalid, setSaving, setSaved, setSaveError} = useValidateThenSave();
  const client = useRef(new GithubClient());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [data, positions, zoneKeys] = await Promise.all([
          loadWorld(client.current, worldKey),
          loadLayoutPositions(client.current, worldKey),
          listAvailableZoneKeys(client.current),
        ]);
        if (cancelled) return;
        setDraft(new WorldDraft(data));
        setGraphPositions(positions);
        setAvailableZoneKeys(zoneKeys);

        const details = await zoneDetailsFor(client.current, worldKey, data.zones);
        if (cancelled) return;
        setZoneDetailsByKey(details);
        setDraft((d) => d.syncZoneDetails(details));
      } catch (error) {
        if (cancelled) return;
        if (error instanceof GithubAuthError) {
          window.location.href = error.redirectUrl;
          return;
        }
        setLoadError(error.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [worldKey]);

  function handleChange(nextDraft) {
    markDirty();
    setDraft(nextDraft);
  }

  // Picks up a zone created in another tab (via the "Create Zone ↗" link)
  // without reloading the whole editor and losing the draft - same idea as
  // ZoneEditor's own handleRefreshMaps.
  async function handleRefreshZoneKeys() {
    setZoneListRefreshStatus("Refreshing…");
    try {
      setAvailableZoneKeys(await listAvailableZoneKeys(client.current));
      setZoneListRefreshStatus("Refreshed.");
    } catch (error) {
      setZoneListRefreshStatus(`Refresh failed: ${error.message}`);
    }
  }

  async function handleRefreshConnections() {
    setConnectionsRefreshStatus("Refreshing…");
    try {
      const details = await zoneDetailsFor(client.current, worldKey, draft.data.zones);
      setZoneDetailsByKey(details);
      setDraft((d) => d.syncZoneDetails(details));
      setConnectionsRefreshStatus("Refreshed.");
    } catch (error) {
      setConnectionsRefreshStatus(`Refresh failed: ${error.message}`);
    }
  }

  // A picked zone key's path is deterministic (zoneRefPath), not something
  // the author needs to type - recorded immediately, then its real
  // name/description/openConnections/entryPoints are fetched and synced
  // in (see WorldDraft#syncZoneDetails) - name/description are cached in
  // the world's own JSON, but always derived this way, never typed by
  // hand (see ZonesPanel).
  async function handleAddZone(key) {
    const path = zoneRefPath(key);
    markDirty();
    setDraft((d) => d.setZone(key, {path, name: key, description: null}));
    try {
      const details = await zoneDetailsFor(client.current, worldKey, {[key]: {path}});
      if (!details[key]) return;
      setZoneDetailsByKey((current) => ({...current, ...details}));
      setDraft((d) => d.syncZoneDetails(details));
    } catch {
      // best-effort, same as ZoneEditor's own fetchMapDetail
    }
  }

  async function handleValidate() {
    setValidating();
    try {
      const {valid, error} = await validateWorld(draft.data);
      if (valid) {
        setValid();
      } else {
        setInvalid(error.message);
      }
    } catch (error) {
      setInvalid(error.message);
    }
  }

  async function handleSave() {
    setSaving();
    try {
      await saveWorld(worldKey, draft.data, graphPositions);
      setSaved();
    } catch (error) {
      if (error instanceof GithubAuthError) {
        window.location.href = error.redirectUrl;
        return;
      }
      setSaveError(error.message);
    }
  }

  if (loadError) return <div className="world-editor-load-error">Failed to load: {loadError}</div>;
  if (draft === null) return <div className="world-editor-loading">Loading…</div>;

  return (
    <div className="world-editor">
      <div className="world-editor-canvas-area">
        <WorldGraphCanvas
          draft={draft}
          onChange={handleChange}
          zoneDetailsByKey={zoneDetailsByKey}
          onRefresh={handleRefreshConnections}
          refreshStatus={connectionsRefreshStatus}
          initialPositions={graphPositions}
          onPositionsChange={setGraphPositions}
        />
      </div>
      <div className="world-editor-sidebar">
        <ValidateSaveBar validity={validity} activity={activity} onValidate={handleValidate} onSave={handleSave} />
        <WorldFieldsPanel draft={draft} onChange={handleChange} />
        <ZonesPanel
          draft={draft}
          onChange={handleChange}
          availableZoneKeys={availableZoneKeys}
          onAddZone={handleAddZone}
          onRefresh={handleRefreshZoneKeys}
          refreshStatus={zoneListRefreshStatus}
          newZoneUrl={newZoneUrl}
        />
        <WorldLinksPanel draft={draft} onChange={handleChange} zoneDetailsByKey={zoneDetailsByKey} />
        <EntryPointsPanel draft={draft} onChange={handleChange} zoneDetailsByKey={zoneDetailsByKey} />
      </div>
    </div>
  );
}
