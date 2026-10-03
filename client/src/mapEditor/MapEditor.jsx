import {useEffect, useRef, useState} from "react";
import MapWorkbench from "./MapWorkbench";
import {MapDraft} from "./MapDraft";
import {saveMap} from "./saveMap";
import {blankMap, loadMap, loadMapImageUrl, listUnitTypeKeys, listItemKeys, unitTypeDetailsFor, itemDetailsFor, ncuTokenUrlsFor} from "./mapContentLoaders";
import {validateMap} from "../validators/validateContent";
import {useValidateThenSave} from "../validators/useValidateThenSave";
import ValidateSaveBar from "../validators/ValidateSaveBar";
import {GithubClient, GithubAuthError} from "../github/delve-github";
import {redirectTo} from "../redirectTo";

// The standalone map editor: loads a map from the content repo's default
// branch, hosts MapWorkbench (the editing surface itself) around it, and
// validates/saves it. The world editor hosts the same workbench over its
// live draft instead (see worldBuilder/levels/MapLevel.jsx).
//
// Unit types and items come from the repo-wide unit_types/ and items/: the
// cheap key lists (a directory listing each) are fetched on mount and on
// Refresh; details only for the keys actually in use or just picked, since
// a repo can hold far more of them than any one map uses.
export default function MapEditor({mapKey, backUrl, newUnitTypeUrl, newItemUrl}) {
  const [mapData, setMapData] = useState(() => blankMap(mapKey));
  const [imageUrl, setImageUrl] = useState(null);
  // A freshly picked background, committed on the next save.
  const [imageFile, setImageFile] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const client = useRef(new GithubClient());
  const {validity, activity, markDirty, setValidating, setValid, setInvalid, setSaving, setSaved, setSaveError} = useValidateThenSave();

  const [availableUnitTypeKeys, setAvailableUnitTypeKeys] = useState([]);
  const [unitTypeDetails, setUnitTypeDetails] = useState({});
  const [availableItemKeys, setAvailableItemKeys] = useState([]);
  const [itemDetails, setItemDetails] = useState({});
  const [refreshStatus, setRefreshStatus] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await loadMap(client.current, mapKey);
        if (cancelled) return;
        setMapData(data);

        const url = await loadMapImageUrl(client.current, mapKey, data);
        if (!cancelled && url) setImageUrl(url);

        const [unitTypeKeys, itemKeys] = await Promise.all([listUnitTypeKeys(client.current), listItemKeys(client.current)]);
        if (cancelled) return;
        setAvailableUnitTypeKeys(unitTypeKeys);
        setAvailableItemKeys(itemKeys);
        setLoaded(true);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof GithubAuthError) {
          redirectTo(error.redirectUrl);
          return;
        }
        setLoadError(error.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mapKey]);

  // Raw tokenImageUrl -> viewable URL, for every NCU on this map.
  const [ncuTokenUrls, setNcuTokenUrls] = useState({});
  const ncuTokenKey = [...new Set((mapData.ncus ?? []).map((n) => n.tokenImageUrl).filter(Boolean))].sort().join("|");
  useEffect(() => {
    const raw = ncuTokenKey ? ncuTokenKey.split("|") : [];
    let cancelled = false;
    ncuTokenUrlsFor(client.current, mapKey, raw).then((urls) => { if (!cancelled) setNcuTokenUrls(urls); });
    return () => { cancelled = true; };
  }, [mapKey, ncuTokenKey]);

  // Picks up a unit type or item created in another tab without reloading
  // (and losing the draft) - only the cheap key lists are re-fetched.
  async function handleRefresh() {
    setRefreshStatus("Refreshing…");
    try {
      const [unitTypeKeys, itemKeys] = await Promise.all([listUnitTypeKeys(client.current), listItemKeys(client.current)]);
      setAvailableUnitTypeKeys(unitTypeKeys);
      setAvailableItemKeys(itemKeys);
      setRefreshStatus("Refreshed.");
    } catch (error) {
      setRefreshStatus(`Refresh failed: ${error.message}`);
    }
  }

  // Best-effort: a unit type or item that fails to resolve just keeps its
  // default marker/label rather than surfacing an error.
  async function fetchUnitTypeDetails(keys) {
    const missing = keys.filter((key) => !(key in unitTypeDetails));
    if (missing.length === 0) return;
    try {
      const details = await unitTypeDetailsFor(client.current, missing);
      setUnitTypeDetails((current) => ({...current, ...details}));
    } catch {
      // best-effort, see above
    }
  }

  async function fetchItemDetails(keys) {
    const missing = keys.filter((key) => !(key in itemDetails));
    if (missing.length === 0) return;
    try {
      const details = await itemDetailsFor(client.current, missing);
      setItemDetails((current) => ({...current, ...details}));
    } catch {
      // best-effort, see above
    }
  }

  // Details for every unit type and loot item already on the map (loot
  // identifiers are assumed to be item file keys - see
  // Build::MapsController#available_items).
  useEffect(() => {
    fetchUnitTypeDetails([...new Set(mapData.units.map((unit) => unit.unitType).filter(Boolean))]);
    fetchItemDetails([...new Set(mapData.units.flatMap((unit) => Object.keys(unit.lootTable ?? {})))]);
    // only re-run when the units themselves change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapData.units]);

  function handleMapChange(fn) {
    markDirty();
    setMapData((current) => fn(new MapDraft(current)).data);
  }

  function handleImageUpload(file) {
    setImageFile(file);
    setImageUrl((current) => {
      if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
  }

  async function handleValidate() {
    setValidating();
    try {
      const {valid, error} = await validateMap(mapData);
      if (valid) setValid();
      else setInvalid(error.message);
    } catch (error) {
      setInvalid(error.message);
    }
  }

  async function handleSave(commitMessage) {
    setSaving();
    try {
      await saveMap(mapKey, mapData, imageFile, commitMessage);
      setSaved();
    } catch (error) {
      if (error instanceof GithubAuthError) {
        redirectTo(error.redirectUrl);
        return;
      }
      setSaveError(error.message);
    }
  }

  if (loadError) return <div className="map-editor-load-error">Failed to load: {loadError}</div>;
  if (!loaded) return <div className="map-editor-loading">Loading…</div>;

  return (
    <MapWorkbench
      mapKey={mapKey}
      mapData={mapData}
      onMapChange={handleMapChange}
      imageUrl={imageUrl}
      onImageUpload={handleImageUpload}
      unitTypes={{keys: availableUnitTypeKeys, details: unitTypeDetails, request: (key) => fetchUnitTypeDetails([key]), newUrl: newUnitTypeUrl}}
      items={{keys: availableItemKeys, details: itemDetails, request: (key) => fetchItemDetails([key]), newUrl: newItemUrl}}
      onRefresh={handleRefresh}
      refreshStatus={refreshStatus}
      ncuTokenUrls={ncuTokenUrls}
      backUrl={backUrl}
      sidebarHeader={
        <ValidateSaveBar validity={validity} activity={activity} onValidate={handleValidate} onSave={handleSave} defaultMessage={`Update ${mapData.name || mapKey}`} />
      }
    />
  );
}
