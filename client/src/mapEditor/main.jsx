import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import MapEditor from "./MapEditor";

const el = document.getElementById("editor-root");
createRoot(el).render(
  <StrictMode>
    <MapEditor
      mapKey={el.dataset.key}
      backUrl={el.dataset.backUrl}
      newUnitTypeUrl={el.dataset.newUnitTypeUrl}
      newItemUrl={el.dataset.newItemUrl}
    />
  </StrictMode>
);
