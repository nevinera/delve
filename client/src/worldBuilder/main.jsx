import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import WorldBuilderApp from "./WorldBuilderApp";
import {adoptBranchParam} from "../github/branchPreference";

adoptBranchParam();

const el = document.getElementById("editor-root");
createRoot(el).render(
  <StrictMode>
    <WorldBuilderApp
      worldKey={el.dataset.key}
      backUrl={el.dataset.backUrl}
      publishUrl={el.dataset.publishUrl}
      nextTag={el.dataset.nextTag}
      stockAssets={JSON.parse(el.dataset.stockAssets)}
      zonePlayUrl={el.dataset.zonePlayUrl}
    />
  </StrictMode>
);
