import {StrictMode} from "react";
import {createRoot} from "react-dom/client";

// Placeholder mount point - Build::UnitTypesController#edit and its routes/
// views/layout are wired up end-to-end, but the real editor UI (fields
// panel, preview pane, save/validate) lands in a follow-up pass. Reads the
// same data-* attributes app/views/build/unit_types/edit.html.erb already
// renders, so swapping this out later needs no controller/view changes.
const el = document.getElementById("editor-root");
createRoot(el).render(
  <StrictMode>
    <p style={{padding: 20}}>Unit type editor coming soon - key: {el.dataset.key}</p>
  </StrictMode>
);
