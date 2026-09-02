import {useReducer} from "react";
import {abilityReducer} from "./abilityReducer";
import AbilityPreviewPane from "./AbilityPreviewPane";
import AbilityFieldsPanel from "./AbilityFieldsPanel";

export default function AbilityEditor({initialAbility, assetMap}) {
  const [ability, dispatch] = useReducer(abilityReducer, initialAbility);

  return (
    <div className="ability-editor">
      <div className="ability-editor-preview">
        <AbilityPreviewPane ability={ability} assetMap={assetMap} />
      </div>
      <div className="ability-editor-fields">
        <AbilityFieldsPanel ability={ability} dispatch={dispatch} />
      </div>
    </div>
  );
}
