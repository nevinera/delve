import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

const el = document.getElementById("app");
createRoot(el).render(
  <StrictMode>
    <App
      slotToken={el.dataset.slotToken}
      gameServerUrl={el.dataset.gameServerUrl}
      instanceId={el.dataset.instanceId}
      slotId={el.dataset.slotId}
      zoneSourceUrl={el.dataset.zoneSourceUrl}
      characterName={el.dataset.characterName}
      characterTokenUrl={el.dataset.characterTokenUrl}
      classConfigUrl={el.dataset.classConfigUrl}
      ownedZoneItems={JSON.parse(el.dataset.ownedZoneItems || "{}")}
      equippedItems={JSON.parse(el.dataset.equippedItems || "{}")}
      characterItemsUrl={el.dataset.characterItemsUrl}
      equippedItemsUrl={el.dataset.equippedItemsUrl}
      stockAssets={JSON.parse(el.dataset.stockAssets || "{}")}
    />
  </StrictMode>
);
