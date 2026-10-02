// The trail at the top of a config pane. crumbs: [{label, target}] - every
// crumb but the last with a target can be clicked to go back up to it.
export default function Breadcrumbs({crumbs, onSelect}) {
  return (
    <nav className="config-breadcrumbs" aria-label="Breadcrumb">
      {crumbs.map((crumb, i) => {
        const last = i === crumbs.length - 1;
        return (
          <span key={i}>
            {i > 0 && <span className="crumb-sep">›</span>}
            {last || !crumb.target
              ? <span className="crumb-current" aria-current={last ? "page" : undefined}>{crumb.label}</span>
              : <button type="button" className="crumb-link" onClick={() => onSelect(crumb.target)}>{crumb.label}</button>}
          </span>
        );
      })}
    </nav>
  );
}
