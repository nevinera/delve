import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import ClassEditor from "./ClassEditor";

const el = document.getElementById("editor-root");
createRoot(el).render(
  <StrictMode>
    <ClassEditor
      classKey={el.dataset.key}
      initialClass={JSON.parse(el.dataset.class)}
      availableAbilities={JSON.parse(el.dataset.availableAbilities)}
      stockAssets={JSON.parse(el.dataset.stockAssets)}
      newAbilityUrl={el.dataset.newAbilityUrl}
    />
  </StrictMode>
);
