// A level shown over the map level - e.g. a unit type or item just created
// while placing units - with Done to return to the map.
export default function EditModal({title, label, onDone, children}) {
  return (
    <div className="edit-modal-backdrop">
      <div className="content-editor edit-modal" role="dialog" aria-label={label}>
        <header className="content-editor-header">
          <h1>{title}</h1>
          <span className="header-spacer" />
          <button type="button" className="add-entry" onClick={onDone}>Done</button>
        </header>
        {children}
      </div>
    </div>
  );
}
