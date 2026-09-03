import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import AbilityEditor from "./AbilityEditor";

const el = document.getElementById("editor-root");
createRoot(el).render(
  <StrictMode>
    <AbilityEditor
      abilityKey={el.dataset.key}
      initialAbility={JSON.parse(el.dataset.ability)}
      assetMap={JSON.parse(el.dataset.assetMap)}
    />
  </StrictMode>
);
