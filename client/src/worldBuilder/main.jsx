import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import WorldBuilderApp from "./WorldBuilderApp";

const el = document.getElementById("editor-root");
createRoot(el).render(
  <StrictMode>
    <WorldBuilderApp worldKey={el.dataset.key} backUrl={el.dataset.backUrl} />
  </StrictMode>
);
