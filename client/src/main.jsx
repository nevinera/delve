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
      zoneSourceSha={el.dataset.zoneSourceSha}
      classConfigSha={el.dataset.classConfigSha}
      characterName={el.dataset.characterName}
      characterTokenUrl={el.dataset.characterTokenUrl}
      classConfigUrl={el.dataset.classConfigUrl}
      ownedZoneItems={JSON.parse(el.dataset.ownedZoneItems || "{}")}
      equippedItems={JSON.parse(el.dataset.equippedItems || "{}")}
      characterItemsUrl={el.dataset.characterItemsUrl}
      equippedItemsUrl={el.dataset.equippedItemsUrl}
      characterSettings={JSON.parse(el.dataset.characterSettings || "{}")}
      characterSettingsUrl={el.dataset.characterSettingsUrl}
      stockAssets={JSON.parse(el.dataset.stockAssets || "{}")}
      worldReturnUrl={el.dataset.worldReturnUrl}
      leaveWorldUrl={el.dataset.leaveWorldUrl}
    />
  </StrictMode>
);
