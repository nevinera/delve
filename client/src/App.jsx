import { useRef } from "react";

const styles = {
  root: {
    display: "flex",
    flexDirection: "column",
    width: "100vw",
    height: "100vh",
    background: "#111",
    color: "#ddd",
    fontFamily: "monospace",
    fontSize: 13,
    overflow: "hidden",
  },
  frames: {
    display: "flex",
    flexShrink: 0,
    height: 90,
  },
  selfFrame: {
    flex: 1,
    background: "#0d2b0d",
    border: "1px solid #2a6a2a",
    padding: 8,
  },
  targetFrame: {
    flex: 1,
    background: "#2b0d0d",
    border: "1px solid #6a2a2a",
    padding: 8,
  },
  canvas: {
    flex: 1,
    display: "block",
    background: "#ffb6c1",
    minHeight: 0,
  },
  log: {
    flexShrink: 0,
    height: 110,
    background: "#1a1a1a",
    borderTop: "1px solid #333",
    padding: "6px 8px",
    overflowY: "auto",
    lineHeight: 1.5,
  },
};

export default function App({ characterName }) {
  const canvasRef = useRef(null);

  return (
    <div style={styles.root}>
      <div style={styles.frames}>
        <div style={styles.selfFrame}>{characterName ?? "—"}</div>
        <div style={styles.targetFrame}>No target</div>
      </div>
      <canvas ref={canvasRef} style={styles.canvas} />
      <div style={styles.log}>
        <span style={{ color: "#666" }}>Connecting…</span>
      </div>
    </div>
  );
}
