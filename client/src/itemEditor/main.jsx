import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import ItemEditor from "./ItemEditor";

const el = document.getElementById("editor-root");
createRoot(el).render(
  <StrictMode>
    <ItemEditor
      itemKey={el.dataset.key}
      initialItem={JSON.parse(el.dataset.item)}
    />
  </StrictMode>
);
