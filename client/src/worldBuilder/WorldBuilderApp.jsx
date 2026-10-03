import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {BranchClient, GithubAuthError} from "../github/branchClient";
import {loadSnapshot} from "./state/RepoSnapshot";
import {WorldDraft} from "./state/WorldDraft";
import {saveDraft} from "./state/saveDraft";
import {validateDraft} from "./state/validateDraft";
import {expandDraft, isExpanded} from "./state/expandDraft";
import {publishWorld} from "../worldEditor/publishWorld";
import {createDraftStore, draftKey} from "./state/draftStore";
import {createWorld, worldData} from "./state/worldOps";
import {zoneData} from "./state/zoneOps";
import {mapData} from "./state/mapOps";
import {useHashLocation} from "./location";
import {rememberBranch, rememberedBranch} from "./branchPreference";
import Breadcrumbs from "../powersEditor/Breadcrumbs";
import BranchPicker from "./header/BranchPicker";
import UnsavedIndicator from "./header/UnsavedIndicator";
import Pipeline from "./header/Pipeline";
import ValidationProblems from "./header/ValidationProblems";
import WorldLevel from "./levels/WorldLevel";
import ZoneLevel from "./levels/ZoneLevel";
import MapLevel from "./levels/MapLevel";
import {redirectTo} from "../redirectTo";

const PERSIST_DELAY_MS = 400;

function crumbsFor(location, draft) {
  const world = worldData(draft);
  const crumbs = [{label: world?.name || draft.worldKey, target: {}}];
  if (location.zone) crumbs.push({label: zoneData(draft, location.zone)?.name || location.zone, target: {zone: location.zone}});
  if (location.map) crumbs.push({label: mapData(draft, location.zone, location.map)?.name || location.map, target: location});
  return crumbs;
}

// The single-page world editor (see plans/world-editor/). Holds exactly
// one RepoSnapshot (what git says, inside the draft) and one WorldDraft
// (the live draft) for the whole world, plus pure UI state; every level
// reads and edits the draft through worldOps/zoneOps.
//
// `client` and `store` are injectable for tests.
export default function WorldBuilderApp({worldKey, backUrl, publishUrl, nextTag, client: givenClient, store: givenStore}) {
  const client = useRef(givenClient ?? new BranchClient()).current;
  const store = useRef(givenStore ?? createDraftStore()).current;
  const [branches, setBranches] = useState(null);
  const [branch, setBranch] = useState(null);
  const [draft, setDraft] = useState(null);
  const [resumable, setResumable] = useState(null); // a stored draft, offered back on load
  const [loadError, setLoadError] = useState(null);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [repo, setRepo] = useState(null);
  // The last Validate: {hash, problems}. Only counts while hash is the
  // current draft's.
  const [validation, setValidation] = useState(null);
  const [validating, setValidating] = useState(false);
  const [location, navigate] = useHashLocation();
  const storeKey = useRef(null);
  const persistedHash = useRef(null);

  // Whether git's .full.json files match the saved content (resolving every
  // zone, so only recomputed when the draft changes).
  const expanded = useMemo(() => Boolean(draft) && !draft.hasChanges && isExpanded(draft), [draft]);

  const fail = useCallback((error) => {
    if (error instanceof GithubAuthError) redirectTo(error.redirectUrl);
    else setLoadError(error.message);
  }, []);

  // Branches first, then the remembered (or default) branch.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [names, fallback] = await Promise.all([client.listBranches(), client.defaultBranch()]);
        if (cancelled) return;
        const remembered = rememberedBranch();
        setBranches(names);
        setBranch(names.includes(remembered) ? remembered : fallback);
      } catch (error) {
        if (!cancelled) fail(error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, fail]);

  // (Re)loads the world from git whenever the branch changes, and offers
  // back any draft this browser kept for it.
  useEffect(() => {
    if (!branch) return undefined;
    let cancelled = false;
    setDraft(null);
    setResumable(null);
    setLoadError(null);
    (async () => {
      try {
        const snapshot = await loadSnapshot(client, branch, worldKey);
        const repoName = await client.repo();
        storeKey.current = draftKey(repoName, branch, worldKey);
        const stored = await store.load(storeKey.current);
        if (cancelled) return;
        const fresh = WorldDraft.fromSnapshot(snapshot);
        persistedHash.current = fresh.hash();
        setRepo(repoName);
        setDraft(fresh);
        if (stored && Object.keys(stored.changes).length) setResumable(stored);
      } catch (error) {
        if (!cancelled) fail(error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [branch, client, store, worldKey, fail]);

  // Keeps this browser's copy of the draft current, a moment after edits
  // settle. Not while a stored draft is still being offered back.
  useEffect(() => {
    if (!draft || resumable || !storeKey.current) return undefined;
    const hash = draft.hash();
    if (hash === persistedHash.current) return undefined;
    const timer = setTimeout(() => {
      store.save(storeKey.current, draft).then(() => {
        persistedHash.current = hash;
      });
    }, PERSIST_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft, resumable, store]);

  // Only warns about edits not yet in local storage (normally none).
  useEffect(() => {
    function warn(e) {
      if (draft && draft.hash() !== persistedHash.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draft]);

  function resume() {
    setDraft((current) => current.applyChanges(resumable.changes));
    setResumable(null);
  }

  async function discardStored() {
    await store.clear(storeKey.current);
    setResumable(null);
  }

  function selectBranch(name) {
    rememberBranch(name);
    setBranch(name);
  }

  async function createBranch(name) {
    await client.createBranch(name);
    setBranches(await client.listBranches());
    selectBranch(name);
  }

  async function handleSave(message) {
    setSaving(true);
    setStatus({text: "Saving…"});
    try {
      const result = await saveDraft(client, draft, message, {
        onProgress: ({done, total}) => setStatus({text: `Uploading ${done}/${total}…`}),
      });
      await store.clear(storeKey.current);
      persistedHash.current = result.draft.hash();
      setDraft(result.draft);
      setStatus({text: `Saved ${result.snapshot.commitSha.slice(0, 7)}.`});
    } catch (error) {
      if (error instanceof GithubAuthError) {
        redirectTo(error.redirectUrl);
        return;
      }
      setStatus({text: `Save failed: ${error.message}`, error: true});
    } finally {
      setSaving(false);
    }
  }

  async function handleValidate() {
    setValidating(true);
    setStatus({text: "Validating…"});
    const validated = draft;
    try {
      const problems = await validateDraft(validated);
      setValidation({hash: validated.hash(), problems});
      setStatus(problems.length ? {text: `Validation found ${problems.length} problem(s).`, error: true} : {text: "Valid."});
    } catch (error) {
      setStatus({text: `Validate failed: ${error.message}`, error: true});
    } finally {
      setValidating(false);
    }
  }

  async function handleExpand() {
    setSaving(true);
    setStatus({text: "Expanding…"});
    try {
      const result = await expandDraft(client, draft, `Expand ${worldData(draft)?.name || worldKey}`);
      persistedHash.current = result.draft.hash();
      // Expand only adds .full.json files, so what was validated still holds.
      setValidation({hash: result.draft.hash(), problems: []});
      setDraft(result.draft);
      setStatus({text: `Expanded at ${result.snapshot.commitSha.slice(0, 7)}.`});
    } catch (error) {
      if (error instanceof GithubAuthError) {
        redirectTo(error.redirectUrl);
        return;
      }
      setStatus({text: `Expand failed: ${error.message}`, error: true});
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish(tag) {
    setSaving(true);
    setStatus({text: "Publishing…"});
    try {
      const {url} = await publishWorld(publishUrl, tag, {branch, expectedSha: draft.snapshot.commitSha});
      redirectTo(url);
    } catch (error) {
      setStatus({text: `Publish failed: ${error.message}`, error: true});
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <div className="world-builder-notice">
        <h2>Couldn't load {worldKey}</h2>
        <p className="notice-error">{loadError}</p>
        {backUrl && <a href={backUrl}>← Back</a>}
      </div>
    );
  }
  if (!draft) return <div className="world-builder-notice"><p>Loading {worldKey}{branch ? ` from ${branch}` : ""}…</p></div>;

  if (resumable) {
    const moved = resumable.baseCommitSha !== draft.snapshot.commitSha;
    return (
      <div className="world-builder-notice">
        <h2>Resume unsaved work?</h2>
        <p>
          This browser kept {Object.keys(resumable.changes).length} unsaved file change(s) for {worldKey} on {branch},
          from {new Date(resumable.savedAt).toLocaleString()}.
        </p>
        {moved && <p className="notice-error">{branch} has new commits since then; resuming applies your changes on top of them.</p>}
        <div className="notice-actions">
          <button type="button" onClick={resume}>Resume</button>
          <button type="button" onClick={discardStored}>Discard them</button>
        </div>
      </div>
    );
  }

  const world = worldData(draft);
  const validated = validation?.hash === draft.hash() && validation.problems.length === 0;
  const blockers = {
    expand: draft.hasChanges ? "Save first" : !validated ? "Validate first" : expanded ? "Already expanded" : null,
    publish: draft.hasChanges ? "Save first" : !validated ? "Validate first" : !expanded ? "Expand first" : null,
  };
  // A location whose zone or map no longer exists (deleted, renamed) falls
  // back to the nearest level that does.
  const shown = !location.zone || !zoneData(draft, location.zone) ? {}
    : location.map && !mapData(draft, location.zone, location.map) ? {zone: location.zone} : location;
  let level;
  if (!world) level = <CreateWorldNotice worldKey={worldKey} branch={branch} onCreate={(name) => setDraft(createWorld(draft, name))} />;
  else if (shown.map) level = <MapLevel draft={draft} zone={shown.zone} map={shown.map} onChange={setDraft} repo={repo} />;
  else if (shown.zone) level = <ZoneLevel draft={draft} zone={shown.zone} onChange={setDraft} navigate={navigate} repo={repo} />;
  else level = <WorldLevel draft={draft} onChange={setDraft} navigate={navigate} repo={repo} />;

  return (
    <div className="content-editor world-builder">
      <header className="content-editor-header world-builder-header">
        {backUrl && <a className="back-link" href={backUrl}>← Worlds</a>}
        <Breadcrumbs crumbs={crumbsFor(shown, draft)} onSelect={navigate} />
        <span className="header-spacer" />
        <BranchPicker branches={branches} branch={branch} disabled={draft.hasChanges || saving} onSelect={selectBranch} onCreate={createBranch} />
        <UnsavedIndicator draft={draft} />
        <Pipeline
          canSave={draft.hasChanges}
          defaultMessage={`Update ${world?.name || worldKey}`}
          onSave={handleSave}
          validating={validating}
          onValidate={handleValidate}
          blockers={blockers}
          onExpand={handleExpand}
          defaultTag={nextTag}
          onPublish={publishUrl ? handlePublish : null}
          busy={saving || !world}
          status={status}
        />
        <ValidationProblems problems={validation?.hash === draft.hash() ? validation.problems : null} onSelect={navigate} />
      </header>
      {level}
    </div>
  );
}

function CreateWorldNotice({worldKey, branch, onCreate}) {
  const [name, setName] = useState(worldKey);
  return (
    <form className="world-builder-notice world-builder-span" onSubmit={(e) => {
      e.preventDefault();
      onCreate(name.trim() || worldKey);
    }}>
      <h2>New world: {worldKey}</h2>
      <p>There's no worlds/{worldKey}/ on {branch} yet. Nothing is written until you save.</p>
      <input aria-label="World name" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="notice-actions"><button type="submit">Create world</button></div>
    </form>
  );
}
