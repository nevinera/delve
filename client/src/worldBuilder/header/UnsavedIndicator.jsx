// How much unsaved work the draft holds - nudging toward a Save once it
// piles up. Thresholds are rough: enough files, or enough upload bytes,
// that losing them would hurt.
export const HEAVY_FILES = 20;
export const HEAVY_BYTES = 5 * 1024 * 1024;

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.ceil(bytes / 1024)} KB`;
}

export default function UnsavedIndicator({draft}) {
  const files = draft.dirtyPaths().length;
  if (files === 0) return <span className="unsaved-indicator">No unsaved changes</span>;

  const bytes = draft.pendingUploadBytes();
  const heavy = files >= HEAVY_FILES || bytes >= HEAVY_BYTES;
  const text = `${files} unsaved file${files === 1 ? "" : "s"}${bytes ? ` (${formatBytes(bytes)} to upload)` : ""}`;
  return (
    <span className={`unsaved-indicator has-changes${heavy ? " heavy" : ""}`} title={draft.dirtyPaths().join("\n")}>
      {heavy ? `${text} - save soon` : text}
    </span>
  );
}
