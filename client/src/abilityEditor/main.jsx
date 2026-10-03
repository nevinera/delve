import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import AbilityEditor from "./AbilityEditor";
import {adoptBranchParam} from "../github/branchPreference";

adoptBranchParam();

const el = document.getElementById("editor-root");
createRoot(el).render(
  <StrictMode>
    <AbilityEditor
      abilityKey={el.dataset.key}
      stockAssets={JSON.parse(el.dataset.stockAssets)}
    />
  </StrictMode>
);
