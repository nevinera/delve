import {useEffect, useState} from "react";

// The drill-down, mirrored into the URL hash one segment per level
// ("#/zone/forest/map/hub", "#/unit_type/goblin", "#/quests/rat-hunt"), so
// reload and back land in the same place. Only *where* you are lives here -
// edits live in the draft.
export function parseLocation(hash) {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const location = {};
  if (parts[0] === "unit_type" && parts[1]) location.unitType = parts[1];
  if (parts[0] === "item" && parts[1]) location.item = parts[1];
  if (parts[0] === "quests") {
    location.quests = true;
    if (parts[1]) location.quest = parts[1];
  }
  if (parts[0] === "zone" && parts[1]) {
    location.zone = parts[1];
    if (parts[2] === "map" && parts[3]) location.map = parts[3];
  }
  return location;
}

export function formatLocation(location) {
  if (location.unitType) return `#/unit_type/${encodeURIComponent(location.unitType)}`;
  if (location.item) return `#/item/${encodeURIComponent(location.item)}`;
  if (location.quests) return location.quest ? `#/quests/${encodeURIComponent(location.quest)}` : "#/quests";
  if (!location.zone) return "#/";
  const zone = `#/zone/${encodeURIComponent(location.zone)}`;
  return location.map ? `${zone}/map/${encodeURIComponent(location.map)}` : zone;
}

export function useHashLocation() {
  const [location, setLocation] = useState(() => parseLocation(window.location.hash));
  useEffect(() => {
    const onChange = () => setLocation(parseLocation(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const navigate = (next) => {
    const hash = formatLocation(next);
    if (window.location.hash !== hash) window.location.hash = hash;
    setLocation(next);
  };
  return [location, navigate];
}
