import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import WorldEditor from "./WorldEditor";

const el = document.getElementById("editor-root");
createRoot(el).render(
  <StrictMode>
    <WorldEditor worldKey={el.dataset.key} newZoneUrl={el.dataset.newZoneUrl} />
  </StrictMode>
);
