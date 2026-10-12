// A thing's annotations (docs/schema/common.md#annotations), for the editors:
// each key with its text, editable, and removable. Annotations are an LLM's
// notes, written with bin/annotate, so there's no way to add one here, and
// nothing shows for a thing without any. onChange gets the new annotations,
// or undefined once the last is removed.
export default function AnnotationsSection({annotations, onChange}) {
  const entries = Object.entries(annotations ?? {});
  if (!entries.length) return null;

  const set = (key, text) => onChange({...annotations, [key]: text});
  const remove = (key) => {
    const {[key]: _removed, ...rest} = annotations;
    onChange(Object.keys(rest).length ? rest : undefined);
  };

  return (
    <div className="annotations-section">
      <div className="annotations-heading" title="Notes for an LLM, written with bin/annotate">Annotations</div>
      {entries.map(([key, text]) => (
        <div key={key} className="annotations-entry">
          <div className="annotations-key-row">
            <label htmlFor={`annotation-${key}`}>{key}</label>
            <button type="button" className="annotations-remove" aria-label={`Remove annotation ${key}`} onClick={() => remove(key)}>×</button>
          </div>
          <textarea
            id={`annotation-${key}`} value={text} rows={Math.min(12, Math.max(2, text.split("\n").length))}
            onChange={(e) => set(key, e.target.value)}
          />
        </div>
      ))}
    </div>
  );
}
