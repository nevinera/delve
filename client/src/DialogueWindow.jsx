import { useState } from "react";

// Steps through `lines` one at a time; the last line's button closes it.
// Keyed by the speaking unit's id by the caller, so talking to someone new
// starts from their first line.
export function DialogueWindow({ name, lines, onClose }) {
  const [index, setIndex] = useState(0);
  if (!lines?.length) return null;
  const last = index >= lines.length - 1;

  return (
    <div style={styles.window} role="dialog" aria-label={name}>
      <div style={styles.header}>
        <span style={styles.title}>{name}</span>
        <button style={styles.close} onClick={onClose} aria-label="Close">✕</button>
      </div>
      <p style={styles.line}>{lines[index]}</p>
      <div style={styles.footer}>
        <button style={styles.next} onClick={last ? onClose : () => setIndex(index + 1)}>
          {last ? "Goodbye" : "Next"}
        </button>
      </div>
    </div>
  );
}

const styles = {
  window: {
    position: "absolute",
    zIndex: 20,
    left: "50%",
    bottom: "22%",
    transform: "translateX(-50%)",
    width: "min(420px, calc(100% - 32px))",
    boxSizing: "border-box",
    background: "rgba(20,16,12,0.95)",
    border: "1px solid #7a5a2a",
    borderRadius: 6,
    padding: "10px 16px 12px",
    pointerEvents: "auto",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  title: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#d4a84b",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  close: {
    background: "none",
    border: "none",
    color: "#888",
    fontSize: 16,
    cursor: "pointer",
    lineHeight: 1,
    padding: "0 2px",
  },
  line: {
    color: "#e8e0d0",
    fontSize: 15,
    lineHeight: 1.4,
    margin: "4px 0 10px",
    whiteSpace: "pre-wrap",
  },
  footer: {
    display: "flex",
    justifyContent: "flex-end",
  },
  next: {
    background: "#3a2a14",
    color: "#e8d0a0",
    border: "1px solid #7a5a2a",
    borderRadius: 4,
    padding: "4px 14px",
    cursor: "pointer",
    fontSize: 14,
  },
};
