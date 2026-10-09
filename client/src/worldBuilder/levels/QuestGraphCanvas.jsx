import {useEffect, useMemo, useRef, useState} from "react";
import {chainColor, positionKey, questLayout} from "../state/questOps";

const QUEST_WIDTH = 160;
const QUEST_HEIGHT = 44;
const FLAG_RADIUS = 14;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3;
const CLICK_SLOP = 4; // pixels a press can move and still count as a click
const FIT_MARGIN = 80;

const EDGE_STYLES = {
  prerequisite: {stroke: "#9cf", dash: null},
  requires: {stroke: "#c96", dash: "5 4"},
  grants: {stroke: "#6c9", dash: "5 4"},
};

// Where an edge leaves or meets a node: the box's or circle's edge, toward
// the other end.
function anchor(node, position, toward) {
  const dx = toward.x - position.x;
  const dy = toward.y - position.y;
  const length = Math.hypot(dx, dy) || 1;
  if (node.kind === "flag") return {x: position.x + (dx / length) * FLAG_RADIUS, y: position.y + (dy / length) * FLAG_RADIUS};
  const scale = Math.min((QUEST_WIDTH / 2) / Math.abs(dx || 1e-6), (QUEST_HEIGHT / 2) / Math.abs(dy || 1e-6));
  return {x: position.x + dx * scale, y: position.y + dy * scale};
}

function fitView(positions, width, height) {
  const points = Object.values(positions);
  if (!points.length || width <= 0 || height <= 0) return {panX: width / 2, panY: height / 2, zoom: 1};
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const zoom = Math.min(1.5, Math.max(MIN_ZOOM, Math.min(
    width / (maxX - minX + QUEST_WIDTH + FIT_MARGIN),
    height / (maxY - minY + QUEST_HEIGHT + FIT_MARGIN),
  )));
  return {panX: width / 2 - zoom * (minX + maxX) / 2, panY: height / 2 - zoom * (minY + maxY) / 2, zoom};
}

// The quests graph (see questOps.questGraph): quests as boxes (with their
// chain's badge, and a diamond for marker quests), other flags as small
// circles, and arrows for prerequisites, grants and requirements. Drag
// nodes to arrange them (reported, keyed by positionKey, when a drag
// ends), drag the background to pan, wheel to zoom; clicking a quest
// opens it.
export default function QuestGraphCanvas({graph, initialPositions, onPositionsChange, onOpenQuest}) {
  const wrapper = useRef(null);
  const [positions, setPositions] = useState(() => questLayout(graph, initialPositions));
  const [view, setView] = useState(null);
  const press = useRef(null);
  // The latest positions, for reporting when a drag ends.
  const latest = useRef(positions);
  latest.current = positions;
  const nodesById = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph]);

  // New nodes (a quest just created, a flag just added) get a place.
  useEffect(() => {
    setPositions((current) => {
      const missing = graph.nodes.filter((node) => !current[node.id]);
      if (!missing.length) return current;
      const saved = Object.fromEntries(graph.nodes.filter((node) => current[node.id]).map((node) => [positionKey(node), current[node.id]]));
      return questLayout(graph, saved);
    });
  }, [graph]);

  useEffect(() => {
    const rect = wrapper.current?.getBoundingClientRect();
    setView(fitView(positions, rect?.width ?? 800, rect?.height ?? 600));
    // Fit once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toGraph = (e) => {
    const rect = wrapper.current.getBoundingClientRect();
    return {x: (e.clientX - rect.left - view.panX) / view.zoom, y: (e.clientY - rect.top - view.panY) / view.zoom};
  };

  function report(next) {
    onPositionsChange?.(Object.fromEntries(graph.nodes.filter((node) => next[node.id]).map((node) => [positionKey(node), next[node.id]])));
  }

  function onPointerDown(e, node = null) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    press.current = {node, startX: e.clientX, startY: e.clientY, moved: false, view, from: node ? positions[node.id] : null, grab: node ? toGraph(e) : null};
  }

  function onPointerMove(e) {
    const p = press.current;
    if (!p) return;
    const dx = e.clientX - p.startX;
    const dy = e.clientY - p.startY;
    if (Math.hypot(dx, dy) > CLICK_SLOP) p.moved = true;
    if (!p.moved) return;
    if (p.node) {
      const at = toGraph(e);
      setPositions((current) => ({...current, [p.node.id]: {x: Math.round(p.from.x + at.x - p.grab.x), y: Math.round(p.from.y + at.y - p.grab.y)}}));
    } else {
      setView({...p.view, panX: p.view.panX + dx, panY: p.view.panY + dy});
    }
  }

  function onPointerUp() {
    const p = press.current;
    press.current = null;
    if (!p) return;
    if (p.node && p.moved) report(latest.current);
    else if (p.node?.kind === "quest" && !p.moved) onOpenQuest?.(p.node.identifier);
  }

  function onWheel(e) {
    if (!view) return;
    const rect = wrapper.current.getBoundingClientRect();
    const [x, y] = [e.clientX - rect.left, e.clientY - rect.top];
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
    setView({zoom, panX: x - (x - view.panX) * (zoom / view.zoom), panY: y - (y - view.panY) * (zoom / view.zoom)});
  }

  return (
    <div className="quest-graph" ref={wrapper} onPointerDown={(e) => onPointerDown(e)} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onWheel={onWheel}>
      {graph.nodes.length === 0 && <p className="quest-graph-empty">No quests yet.</p>}
      {view && (
        <svg width="100%" height="100%" role="img" aria-label="Quests graph">
          <defs>
            {Object.entries(EDGE_STYLES).map(([kind, style]) => (
              <marker key={kind} id={`quest-arrow-${kind}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill={style.stroke} />
              </marker>
            ))}
          </defs>
          <g transform={`translate(${view.panX} ${view.panY}) scale(${view.zoom})`}>
            {graph.edges.map((edge) => {
              const [from, to] = [nodesById.get(edge.from), nodesById.get(edge.to)];
              const [a, b] = [positions[edge.from], positions[edge.to]];
              if (!from || !to || !a || !b) return null;
              const [start, end] = [anchor(from, a, b), anchor(to, b, a)];
              const style = EDGE_STYLES[edge.kind];
              return (
                <line key={`${edge.from}->${edge.to}`} x1={start.x} y1={start.y} x2={end.x} y2={end.y}
                  stroke={style.stroke} strokeWidth={2} strokeDasharray={style.dash ?? undefined} markerEnd={`url(#quest-arrow-${edge.kind})`} />
              );
            })}
            {graph.nodes.map((node) => {
              const at = positions[node.id];
              if (!at) return null;
              const handlers = {onPointerDown: (e) => onPointerDown(e, node)};
              if (node.kind === "flag") {
                return (
                  <g key={node.id} className="quest-graph-flag" transform={`translate(${at.x} ${at.y})`} {...handlers}>
                    <title>{node.flag}</title>
                    <circle r={FLAG_RADIUS} />
                    <text textAnchor="middle" dominantBaseline="central">⚑</text>
                  </g>
                );
              }
              return (
                <g key={node.id} className="quest-graph-quest" transform={`translate(${at.x} ${at.y})`} {...handlers}
                  role="button" aria-label={`Quest ${node.name}`}>
                  <rect x={-QUEST_WIDTH / 2} y={-QUEST_HEIGHT / 2} width={QUEST_WIDTH} height={QUEST_HEIGHT} rx={6} />
                  <text textAnchor="middle" dominantBaseline="central">{node.marker ? "◆ " : ""}{node.name}</text>
                  {node.chainIdentifier && (
                    <rect className="quest-graph-chain" x={-QUEST_WIDTH / 2 + 6} y={-QUEST_HEIGHT / 2 + 6} width={10} height={10} rx={2}
                      fill={chainColor(node.chainIdentifier)}>
                      <title>{node.chainName || node.chainIdentifier}</title>
                    </rect>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      )}
    </div>
  );
}
