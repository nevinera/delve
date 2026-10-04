import {useEffect, useRef, useState} from "react";
import {BranchClient} from "./branchClient";
import {rememberBranch, rememberedBranch} from "./branchPreference";

// The branch a file editor (class, ability) reads and writes: the one
// remembered from any editor if it still exists, else the default. select
// and create also remember the choice. branch is null until known.
export function useEditorBranch(givenClient = null) {
  const client = useRef(givenClient ?? new BranchClient()).current;
  const [branches, setBranches] = useState(null);
  const [branch, setBranch] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([client.listBranches(), client.defaultBranch()]).then(([names, fallback]) => {
      if (cancelled) return;
      const remembered = rememberedBranch();
      setBranches(names);
      setBranch(names.includes(remembered) ? remembered : fallback);
    }, (e) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
  }, [client]);

  function select(name) {
    rememberBranch(name);
    setBranch(name);
  }

  async function create(name) {
    await client.createBranch(name);
    setBranches(await client.listBranches());
    select(name);
  }

  return {branches, branch, select, create, error};
}
