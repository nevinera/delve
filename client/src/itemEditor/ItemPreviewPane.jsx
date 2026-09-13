import {useState} from "react";
import {ItemTooltip} from "../App";
import {rawItemStats} from "./itemStats";

// Live preview of how this draft renders in-game via the shared ItemTooltip
// component (same one used on the character sheet / loot popups) - stats
// are computed at em = 1.0 (see rawItemStats) and ItemTooltip itself applies
// the elevation scaling from the localElvl control below, exactly like the
// character sheet's own elvl-preview toggle (docs/stats.md).
export default function ItemPreviewPane({itemData}) {
  const [localElvl, setLocalElvl] = useState(itemData.elvl ?? 0);

  const previewItem = {
    ...itemData,
    stats: itemData.slot ? rawItemStats(itemData) : {},
  };

  const relativeElevation = (itemData.elvl ?? 0) - localElvl;
  const relativeElevationLabel = `${relativeElevation >= 0 ? "+" : ""}${relativeElevation}`;

  return (
    <>
      <ItemTooltip item={previewItem} localElvl={localElvl} pinned>
        <span style={{fontSize: "16px"}}>{itemData.name || "(unnamed item)"}</span>
      </ItemTooltip>
      <div className="item-preview-elvl-control">
        <label htmlFor="preview-elvl">Preview at elevation</label>
        <input
          id="preview-elvl" type="number" step="any" value={localElvl}
          onChange={(e) => setLocalElvl(e.target.value === "" ? 0 : parseFloat(e.target.value))}
        />
        <span>Relative Elevation: {relativeElevationLabel}</span>
      </div>
    </>
  );
}
