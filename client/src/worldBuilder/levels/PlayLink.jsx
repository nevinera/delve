// Play-tests a zone in a new tab (see Build::ZonePlaysController's world
// source), or says why it can't yet. play is WorldBuilderApp's {url(zone)}
// or {blocker}.
export default function PlayLink({play, zone}) {
  if (!play) return null;
  if (play.blocker) return <button type="button" className="add-entry play-link" disabled title={play.blocker} aria-label={`Play ${zone}`}>▶ Play</button>;
  return <a className="add-entry play-link" href={play.url(zone)} target="_blank" rel="noreferrer" aria-label={`Play ${zone}`}>▶ Play</a>;
}
