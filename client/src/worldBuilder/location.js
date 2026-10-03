import {useEffect, useState} from "react";

// The drill-down, mirrored into the URL hash one segment per level
// ("#/zone/forest"), so reload and back land in the same place. Only
// *where* you are lives here - edits live in the draft.
export function parseLocation(hash) {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const location = {};
  if (parts[0] === "zone" && parts[1]) location.zone = parts[1];
  return location;
}

export function formatLocation(location) {
  return location.zone ? `#/zone/${encodeURIComponent(location.zone)}` : "#/";
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
