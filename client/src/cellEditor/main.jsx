import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import CellEditor from "./CellEditor";
import "../styles/cellEditor/index.css";

const el = document.getElementById("editor-root");
createRoot(el).render(
  <StrictMode>
    <CellEditor backUrl={el.dataset.backUrl} />
  </StrictMode>
);
