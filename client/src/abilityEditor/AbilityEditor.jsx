import {useEffect, useMemo, useRef, useState} from "react";
import {AbilityDraft} from "./AbilityDraft";
import {blankAbility} from "./blankAbility";
import {collectAssetUrls} from "./collectAssetUrls";
import AbilityPreviewPane from "./AbilityPreviewPane";
import AbilityFieldsPanel from "./AbilityFieldsPanel";
import {reindexBySection} from "./reindexBySection";
import {saveAbility} from "./saveAbility";
import {validateAbility} from "../validators/validateContent";
import {useValidateThenSave} from "../validators/useValidateThenSave";
import ValidateSaveBar from "../validators/ValidateSaveBar";
import {GithubClient, GithubAuthError} from "../github/delve-github";
import {useEditorBranch} from "../github/useEditorBranch";
import BranchPicker from "../content/BranchPicker";
import {redirectTo} from "../redirectTo";

// Resolves a relative asset path (as stored in the ability JSON, e.g.
// "../graphics/icons/x.svg") against the ability's own location in the
// repo - same trick saveAbility.js's own resolveRepoPath uses for writes.
function resolveRepoPath(key, relativePath) {
  const url = new URL(relativePath, `https://_/abilities/${key}.json`);
  return url.pathname.replace(/^\//, "");
}

export default function AbilityEditor({abilityKey, stockAssets}) {
  const [draft, setDraft] = useState(null);
  const [assetMap, setAssetMap] = useState({});
  const [loadError, setLoadError] = useState(null);
  const [assetOverrides, setAssetOverrides] = useState({});
  const overrideUrlsRef = useRef({});
  // The actual uploaded File objects, keyed the same way as assetOverrides -
  // needed at save time (assetOverrides only holds blob: URLs, which are
  // for preview only and can't be read back into bytes for a commit).
  const pendingFilesRef = useRef({});
  const {validity, activity, dirty, markDirty, reset, setValidating, setValid, setInvalid, setSaving, setSaved, setSaveError} = useValidateThenSave();
  // Reads and writes the picked branch (see useEditorBranch); switching
  // reloads the ability from it.
  const {branches, branch, select, create, error: branchError} = useEditorBranch();
  const client = useMemo(() => (branch ? new GithubClient({branch}) : null), [branch]);

  // The ability's own content, and every asset URL it references, are
  // fetched client-side on mount (and on a branch switch - see
  // plans/editor-git.md) rather than
  // bootstrapped from the server. Building assetMap needs no fetch of its
  // own at all now - GithubClient#assetUrl just builds a
  // raw.githubusercontent.com URL synchronously (once the branch lookup's
  // cached), since the content repo is always public.
  useEffect(() => {
    if (!client) return undefined;
    let cancelled = false;
    setDraft(null);
    reset();
    for (const url of Object.values(overrideUrlsRef.current)) URL.revokeObjectURL(url);
    overrideUrlsRef.current = {};
    pendingFilesRef.current = {};
    setAssetOverrides({});
    client
      .fetchFile(`abilities/${abilityKey}.json`)
      .then(async (content) => {
        if (cancelled) return;
        const data = content === null ? blankAbility(abilityKey) : JSON.parse(content);
        setDraft(new AbilityDraft(data));

        const urls = collectAssetUrls(data);
        const entries = await Promise.all(urls.map(async (url) => [url, await client.assetUrl(resolveRepoPath(abilityKey, url))]));
        if (!cancelled) setAssetMap(Object.fromEntries(entries));
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof GithubAuthError) {
          redirectTo(error.redirectUrl);
          return;
        }
        setLoadError(error.message);
      });
    return () => {
      cancelled = true;
    };
    // reset is a fresh function each render; only the ability and branch matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abilityKey, client]);

  // Every draft edit needs to drop a prior "valid" (or "invalid") result -
  // see useValidateThenSave - so this wraps the setter rather than calling
  // markDirty at each of the several call sites below.
  function handleChange(nextDraft) {
    markDirty();
    setDraft(nextDraft);
  }

  // "Uploads" a local file as a stand-in for a not-yet-saved asset (preview
  // only - see resolveAbilityForPlayback). Keyed by field name, not by the
  // field's current value, so it works even before iconURL is set.
  function uploadAsset(field, file) {
    const previous = overrideUrlsRef.current[field];
    if (previous) URL.revokeObjectURL(previous);

    const url = URL.createObjectURL(file);
    overrideUrlsRef.current[field] = url;
    pendingFilesRef.current[field] = file;
    setAssetOverrides((current) => ({...current, [field]: url}));
    markDirty();
  }

  // Reverts a field to whatever the server-resolved assetMap (or the field's
  // own value) would show, dropping the local upload.
  function clearAssetOverride(field) {
    const previous = overrideUrlsRef.current[field];
    if (previous) URL.revokeObjectURL(previous);
    delete overrideUrlsRef.current[field];
    delete pendingFilesRef.current[field];

    setAssetOverrides((current) => {
      const next = {...current};
      delete next[field];
      return next;
    });
  }

  function removeEntry(section, index) {
    handleChange(draft.removeEntry(section, index));

    overrideUrlsRef.current = reindexBySection(overrideUrlsRef.current, section, index, (url) => URL.revokeObjectURL(url));
    pendingFilesRef.current = reindexBySection(pendingFilesRef.current, section, index);
    setAssetOverrides((current) => reindexBySection(current, section, index));
  }

  async function handleValidate() {
    setValidating();
    const {valid, error} = await validateAbility(draft.data);
    if (valid) {
      setValid();
    } else {
      setInvalid(error.message);
    }
  }

  async function handleSave(commitMessage) {
    setSaving();
    try {
      await saveAbility(abilityKey, draft.data, pendingFilesRef.current, commitMessage, {branch});
      setSaved();
    } catch (error) {
      if (error instanceof GithubAuthError) {
        redirectTo(error.redirectUrl);
        return;
      }
      setSaveError(error.message);
    }
  }

  if (branchError) return <div className="ability-editor-load-error">Failed to load: {branchError.message}</div>;
  if (loadError) return <div className="ability-editor-load-error">Failed to load: {loadError}</div>;
  if (draft === null) return <div className="ability-editor-loading">Loading…</div>;

  return (
    <div className="ability-editor">
      <div className="ability-editor-preview">
        <AbilityPreviewPane ability={draft.data} assetMap={assetMap} assetOverrides={assetOverrides} stockAssets={stockAssets} />
      </div>
      <div className="ability-editor-fields">
        <div className="ability-editor-branch">
          <BranchPicker branches={branches} branch={branch} disabled={dirty || activity.status === "saving"} onSelect={select} onCreate={create} />
        </div>
        <ValidateSaveBar validity={validity} activity={activity} onValidate={handleValidate} onSave={handleSave} defaultMessage={`Update ${draft.data.name || abilityKey}`} />
        <AbilityFieldsPanel
          draft={draft}
          onChange={handleChange}
          assetOverrides={assetOverrides}
          onUploadAsset={uploadAsset}
          onClearAsset={clearAssetOverride}
          onRemoveEntry={removeEntry}
          stockAssets={stockAssets}
        />
      </div>
    </div>
  );
}
