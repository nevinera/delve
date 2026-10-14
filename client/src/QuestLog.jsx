import { useEffect, useRef, useState } from "react";
import { timerRemaining } from "./game/quests";
import { GameWindow } from "./GameWindow";

// The player's quest log, by zone (see game/quests.js's questLogZones):
// each zone with something to do and its count. The current zone starts
// open; opening another fetches its name and map names from
// zonesUrl/<identifier>. Stays mounted while closed, so opened zones last
// until the page (or instance) changes.
export function QuestLog({open, zones = [], currentZone, currentNames, zonesUrl, onAbandon, onClose, portrait = false, landscape = false}) {
  const [opened, setOpened] = useState(() => new Set());
  const [names, setNames] = useState({});
  const requested = useRef(new Set());

  const toggle = (identifier) => {
    setOpened((current) => {
      const next = new Set(current);
      if (next.has(identifier)) next.delete(identifier);
      else next.add(identifier);
      return next;
    });
    if (identifier === currentZone || !zonesUrl || requested.current.has(identifier)) return;
    requested.current.add(identifier);
    fetch(`${zonesUrl}/${encodeURIComponent(identifier)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((zone) => setNames((current) => ({...current, [identifier]: {maps: zone.map_names ?? {}}})))
      .catch(() => requested.current.delete(identifier));
  };

  if (!open) return null;
  const isOpen = (identifier) => (identifier === currentZone) !== opened.has(identifier);
  const namesFor = (identifier) => (identifier === currentZone ? currentNames : names[identifier]);
  return (
    <GameWindow title="Quests" closeLabel="Close quests" onClose={onClose} portrait={portrait} landscape={landscape}
      wrapperClassName="game-quest-log-wrapper" panelClassName="game-quest-log">
      {zones.length === 0 ? (
        <div className="game-window-empty">No active quests.</div>
      ) : (
        zones.map((zone) => (
          <section key={zone.identifier}>
            <button className="game-quest-zone" aria-expanded={isOpen(zone.identifier)} onClick={() => toggle(zone.identifier)}>
              <span>{isOpen(zone.identifier) ? "▾" : "▸"} {zone.name}</span>
              <span>{zone.count}</span>
            </button>
            {isOpen(zone.identifier) && (
              <div className="game-quest-zone-body">
                {zone.quests.map((quest) => (
                  <QuestEntry key={quest.identifier} quest={quest} names={namesFor(zone.identifier)} onAbandon={onAbandon} />
                ))}
              </div>
            )}
          </section>
        ))
      )}
    </GameWindow>
  );
}

// Counts down a timed quest's remaining time, as m:ss.
function QuestTimer({seconds, startedAt}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const left = timerRemaining(seconds, startedAt ?? now, now);
  return <div className="game-quest-timer">Time left: {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</div>;
}

// One quest's entries in a zone: its unfinished objectives there, or that
// it's ready to turn in there. names ({maps, ncus}) names things in the
// zone, when known.
function QuestEntry({quest, names, onAbandon}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="game-quest">
      <div className="game-quest-name">{quest.name}</div>
      {quest.description && <div className="game-quest-description">{quest.description}</div>}
      <ul className="game-quest-objectives">
        {quest.objectives.map((objective) => (
          <li key={objective.hash} className="game-quest-objective">
            {objective.text}{objective.required > 1 ? `: ${objective.count}/${objective.required}` : ""}
            {objective.map && <span className="game-quest-map"> ({names?.maps?.[objective.map] ?? objective.map})</span>}
          </li>
        ))}
        {quest.turnIn && (
          <li className="game-quest-objective-done">
            Ready to turn in{names?.ncus?.[quest.turnIn] ? ` to ${names.ncus[quest.turnIn]}` : ""}
          </li>
        )}
      </ul>
      {quest.timerSeconds && <QuestTimer seconds={quest.timerSeconds} startedAt={quest.timerStartedAt} />}
      <div className="game-quest-actions">
        {confirming ? (
          <>
            <button className="game-quest-button" onClick={() => onAbandon?.(quest.identifier)}>Abandon {quest.name}</button>
            <button className="game-quest-button" onClick={() => setConfirming(false)}>Keep it</button>
          </>
        ) : (
          <button className="game-quest-button" onClick={() => setConfirming(true)}>Abandon</button>
        )}
      </div>
    </div>
  );
}
