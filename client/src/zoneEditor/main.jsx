import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import ZoneEditor from "./ZoneEditor";

const el = document.getElementById("editor-root");
createRoot(el).render(
  <StrictMode>
    <ZoneEditor
      zoneKey={el.dataset.key}
      initialZone={JSON.parse(el.dataset.zone)}
      initialAvailableMapDetails={JSON.parse(el.dataset.availableMapDetails)}
      availableMapsUrl={el.dataset.availableMapsUrl}
      newMapUrl={el.dataset.newMapUrl}
    />
  </StrictMode>
);
