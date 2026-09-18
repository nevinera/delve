import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import ZoneEditor from "./ZoneEditor";

const el = document.getElementById("editor-root");
createRoot(el).render(
  <StrictMode>
    <ZoneEditor
      zoneKey={el.dataset.key}
      newMapUrl={el.dataset.newMapUrl}
    />
  </StrictMode>
);
