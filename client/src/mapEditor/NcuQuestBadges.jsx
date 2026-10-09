import {useState} from "react";
import {feetToPixel, feetSpacingToPixelsX} from "./mapCoords";

const DEFAULT_NCU_RADIUS_FEET = 2.5;
const ROW_HEIGHT_RATIO = 1.1;

// An NCU's quests, offered or turned in, each once.
function questsOf({offers = [], turnIns = []} = {}) {
  return [...offers, ...turnIns.filter((t) => !offers.some((o) => o.identifier === t.identifier))];
}

// A small quest badge on each NCU that offers or takes turned in a quest
// (questsByNcu: {ncuIdentifier: {offers, turnIns}}, each [{identifier,
// name}]). Clicking it opens the quest, or with several, lists them to
// pick from.
export default function NcuQuestBadges({ncus, questsByNcu, pixelDimensions, feetDimensions, onOpenQuest}) {
  const [listing, setListing] = useState(null); // an NCU identifier
  const stop = (e) => e.stopPropagation();

  return (
    <svg className="map-canvas-shapes" width={pixelDimensions.width} height={pixelDimensions.height}>
      {ncus.map((ncu, i) => {
        const quests = questsOf(questsByNcu[ncu.identifier]);
        if (!quests.length || !ncu.position) return null;
        const p = feetToPixel(ncu.position.x, ncu.position.y, pixelDimensions, feetDimensions);
        const radius = feetSpacingToPixelsX(ncu.tokenRadius ?? DEFAULT_NCU_RADIUS_FEET, pixelDimensions, feetDimensions);
        const size = Math.max(6, radius * 0.4);
        const [x, y] = [p.x + radius * 0.75, p.y - radius * 0.75];
        const open = () => (quests.length === 1 ? onOpenQuest(quests[0].identifier) : setListing(listing === ncu.identifier ? null : ncu.identifier));
        return (
          <g key={i} className="map-ncu-quest-badge" onPointerDown={stop} onMouseDown={stop}>
            <circle cx={x} cy={y} r={size} role="button" aria-label={`Quests for ${ncu.name || ncu.identifier}`} onClick={open}>
              <title>{quests.map((q) => q.name).join(", ")}</title>
            </circle>
            <text x={x} y={y} fontSize={size * 1.3} textAnchor="middle" dominantBaseline="central">!</text>
            {listing === ncu.identifier && quests.map((quest, row) => (
              <text key={quest.identifier} className="map-ncu-quest-option" x={x + size * 1.6} y={y + row * size * 2 * ROW_HEIGHT_RATIO}
                fontSize={size * 1.4} dominantBaseline="central" role="button"
                onClick={() => {
                  setListing(null);
                  onOpenQuest(quest.identifier);
                }}>
                {quest.name}
              </text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}
