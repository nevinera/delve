// The window the game's sheets and logs open in (styles/game/windows/window.css),
// with a title and a close button. On desktop it's a panel inside
// wrapperClassName, which places it (and anything in `aside`, beside it); on
// phones it's a fixed frame whose content scrolls inside it. panelClassName
// and scrollClassName add a window's own rules to the panel and the scroll
// area.
export function GameWindow({
  title, closeLabel, onClose, portrait = false, landscape = false,
  wrapperClassName, panelClassName, scrollClassName, closeClassName = "game-window-close-small",
  aside, children,
}) {
  const phone = portrait || landscape;
  const classes = (...names) => names.filter(Boolean).join(" ");
  return (
    <div className={phone ? classes("game-window-frame", portrait ? "game-window-frame-portrait" : "game-window-frame-landscape") : wrapperClassName}>
      {aside}
      <div className={phone ? classes("game-window-scroll", scrollClassName) : classes("game-window", panelClassName)}>
        <div className="game-window-header">
          <span className="game-window-title">{title}</span>
          <button className={closeClassName} aria-label={closeLabel} onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
