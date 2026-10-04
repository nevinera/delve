// One entry in an editor's bottom-left area list.
export default function AreaButton({selected, onClick, title, detail, children}) {
  return (
    <div className={`area-item${selected ? " selected" : ""}`}>
      <button type="button" className="area-item-main" onClick={onClick} aria-current={selected || undefined}>
        <span className="area-item-title">{title}</span>
        {detail && <span className="area-item-detail">{detail}</span>}
      </button>
      {children}
    </div>
  );
}
