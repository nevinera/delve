import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import UnitTypeEditor from "./UnitTypeEditor";

const el = document.getElementById("editor-root");
createRoot(el).render(
  <StrictMode>
    <UnitTypeEditor
      unitTypeKey={el.dataset.key}
      initialUnitType={JSON.parse(el.dataset.unitType)}
      initialAvailableAbilities={JSON.parse(el.dataset.availableAbilities)}
      stockAssets={JSON.parse(el.dataset.stockAssets)}
      newAbilityUrl={el.dataset.newAbilityUrl}
      availableAbilitiesUrl={el.dataset.availableAbilitiesUrl}
    />
  </StrictMode>
);
