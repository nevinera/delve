import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import MapEditor from "./MapEditor";

const el = document.getElementById("editor-root");
createRoot(el).render(
  <StrictMode>
    <MapEditor
      mapKey={el.dataset.key}
      initialMap={JSON.parse(el.dataset.initialMap)}
      initialImageDataUri={el.dataset.initialImageDataUri || null}
      initialPixelDimensions={el.dataset.initialPixelDimensions ? JSON.parse(el.dataset.initialPixelDimensions) : null}
      backUrl={el.dataset.backUrl}
    />
  </StrictMode>
);
