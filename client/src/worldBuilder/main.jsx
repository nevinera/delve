import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import WorldBuilderApp from "./WorldBuilderApp";
import {rememberBranch} from "./branchPreference";

// Opened from the world list with ?branch=: start on that branch (the
// picker's remembered choice), then drop it from the URL so a later reload
// doesn't override whatever the picker is switched to.
const url = new URL(window.location.href);
const branch = url.searchParams.get("branch");
if (branch) {
  rememberBranch(branch);
  url.searchParams.delete("branch");
  window.history.replaceState(window.history.state, "", url);
}

const el = document.getElementById("editor-root");
createRoot(el).render(
  <StrictMode>
    <WorldBuilderApp
      worldKey={el.dataset.key}
      backUrl={el.dataset.backUrl}
      publishUrl={el.dataset.publishUrl}
      nextTag={el.dataset.nextTag}
    />
  </StrictMode>
);
