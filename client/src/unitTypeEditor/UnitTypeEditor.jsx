import {useEffect, useRef, useState} from "react";
import UnitTypeWorkbench, {normalizeUnitType} from "./UnitTypeWorkbench";
import {blankUnitType} from "./blankUnitType";
import {usePowerUploads} from "../powersEditor/usePowerUploads";
import {saveUnitType} from "./saveUnitType";
import {IMPORT_SOURCE_TYPES, expandPowers, resolveRepoPath} from "../powersEditor/powerSources";
import {collectAssetUrls} from "../abilityEditor/collectAssetUrls";
import {validateUnitType} from "../validators/validateContent";
import {useValidateThenSave} from "../validators/useValidateThenSave";
import ValidateSaveBar from "../validators/ValidateSaveBar";
import {GithubClient, GithubAuthError} from "../github/delve-github";
import {redirectTo} from "../redirectTo";

// unitTypeKey's own "/"s each add a directory level beneath unit_types/, so
// a relative path from unit_types/<key>.json back up to the repo root needs
// one ".." per key segment.
function tokensUnitPrefix(unitTypeKey) {
  return "../".repeat(unitTypeKey.split("/").length);
}

function sourceType(id) {
  return IMPORT_SOURCE_TYPES.find((type) => type.id === id);
}

// The standalone editor for the shared library's unit_types/<key>.json:
// loads it from the default branch, hosts UnitTypeWorkbench (the editing
// surface itself), and validates/saves it. Powers are stored inline -
// anything copied in from the abilities/ library or another unit type is an
// independent copy (see powerSources.js).
export default function UnitTypeEditor({unitTypeKey, stockAssets, backUrl}) {
  const ownPath = `unit_types/${unitTypeKey}.json`;
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [existingTokenImages, setExistingTokenImages] = useState([]);
  // A <key>.full.json left over from when powers were $refs - deleted on
  // the next save, since nothing reads it any more.
  const [staleFullPath, setStaleFullPath] = useState(null);
  // raw.githubusercontent.com/<repo>/<branch>/ - saved assets display from
  // here.
  const [rawBase, setRawBase] = useState(null);
  // Unsaved token uploads by repo path, each with a blob: preview URL.
  const pendingTokenFilesRef = useRef({});
  const [tokenUploadUrls, setTokenUploadUrls] = useState({});
  const {validity, activity, markDirty, setValidating, setValid, setInvalid, setSaving, setSaved, setSaveError} = useValidateThenSave();
  const client = useRef(new GithubClient());
  const powerUploads = usePowerUploads(markDirty);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const content = await client.current.fetchFile(ownPath);
        const raw = content === null ? blankUnitType(unitTypeKey) : JSON.parse(content);
        const loaded = normalizeUnitType(await expandPowers(client.current, raw, ownPath));
        if (cancelled) return;
        setData(loaded);

        const [tokenPaths, unitTypeFiles, base] = await Promise.all([
          client.current.listDirectory("tokens/unit"),
          client.current.listDirectory("unit_types"),
          client.current.assetUrl(""),
        ]);
        if (cancelled) return;
        setRawBase(base);
        setExistingTokenImages(tokenPaths.sort());
        const fullPath = ownPath.replace(/\.json$/, ".full.json");
        setStaleFullPath(unitTypeFiles.includes(fullPath) ? fullPath : null);
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
  }, [unitTypeKey, ownPath]);

  const assetUrl = (repoPath) => (rawBase === null ? null : `${rawBase}${repoPath}`);

  function handleChange(nextData) {
    markDirty();
    setData(nextData);
  }

  // A token slot's value is its path relative to this file; an unsaved
  // upload previews from its blob: URL.
  const tokenImages = {
    options: existingTokenImages.map((path) => ({
      value: `${tokensUnitPrefix(unitTypeKey)}${path}`, label: path.replace(/^tokens\/unit\//, ""), url: assetUrl(path),
    })),
    urlFor: (value) => {
      const repoPath = resolveRepoPath(ownPath, value);
      return tokenUploadUrls[repoPath] ?? assetUrl(repoPath);
    },
    upload: async (file) => {
      const value = `${tokensUnitPrefix(unitTypeKey)}tokens/unit/${file.name}`;
      const repoPath = resolveRepoPath(ownPath, value);
      pendingTokenFilesRef.current = {...pendingTokenFilesRef.current, [repoPath]: file};
      const url = URL.createObjectURL(file);
      setTokenUploadUrls((current) => {
        if (current[repoPath]) URL.revokeObjectURL(current[repoPath]);
        return {...current, [repoPath]: url};
      });
      return value;
    },
  };

  const assetMap = Object.fromEntries([...new Set(collectAssetUrls(data?.powers ?? []))].map((url) => [url, assetUrl(resolveRepoPath(ownPath, url))]));

  async function handleValidate() {
    setValidating();
    try {
      const {valid, error} = await validateUnitType(data);
      if (valid) setValid();
      else setInvalid(error.message);
    } catch (error) {
      setInvalid(error.message);
    }
  }

  async function handleSave(commitMessage) {
    setSaving();
    try {
      // Only uploads a slot still points at.
      const referenced = new Set(data.tokenImageUrl.filter(Boolean).map((url) => resolveRepoPath(ownPath, url)));
      const tokenFiles = Object.fromEntries(Object.entries(pendingTokenFilesRef.current).filter(([path]) => referenced.has(path)));
      await saveUnitType(unitTypeKey, data, {
        tokenFiles,
        powerFiles: powerUploads.files(),
        deletePaths: staleFullPath ? [staleFullPath] : [],
      }, commitMessage);
      pendingTokenFilesRef.current = {};
      powerUploads.committed();
      setStaleFullPath(null);
      setSaved();
    } catch (error) {
      if (error instanceof GithubAuthError) {
        redirectTo(error.redirectUrl);
        return;
      }
      setSaveError(error.message);
    }
  }

  if (loadError) return <div className="unit-type-editor-load-error">Failed to load: {loadError}</div>;
  if (data === null) return <div className="unit-type-editor-loading">Loading…</div>;

  return (
    <div className="content-editor">
      <header className="content-editor-header">
        {backUrl && <a className="back-link" href={backUrl}>← Back</a>}
        <h1>{unitTypeKey}</h1>
        <ValidateSaveBar validity={validity} activity={activity} onValidate={handleValidate} onSave={handleSave} defaultMessage={`Update ${data.name || unitTypeKey}`} />
      </header>
      <UnitTypeWorkbench
        unitTypeKey={unitTypeKey}
        data={data}
        onChange={handleChange}
        tokenImages={tokenImages}
        assetMap={assetMap}
        powerAssets={powerUploads}
        importSources={{
          types: IMPORT_SOURCE_TYPES,
          listSources: (typeId) => sourceType(typeId).listSources(client.current, ownPath),
          loadPowers: (typeId, sourceId) => sourceType(typeId).loadPowers(client.current, sourceId, ownPath),
        }}
        stockAssets={stockAssets}
      />
    </div>
  );
}
