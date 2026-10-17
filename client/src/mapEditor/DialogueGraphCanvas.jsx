import {useMemo, useRef, useState} from "react";
import usePinchZoom from "../usePinchZoom";
import {dialogueLayout, edgeKey} from "./dialogueGraph";

const WIDTH = 150;
const HEIGHT = 46;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3;
const CLICK_SLOP = 4;
const STROKE = "#aab";

function clip(text) {
  const t = (text ?? "").trim() || "(empty)";
  return t.length > 24 ? `${t.slice(0, 23)}…` : t;
}

// Where an edge meets a box, aiming at `toward`.
function anchor(position, toward) {
  const dx = toward.x - position.x;
  const dy = toward.y - position.y;
  const scale = Math.min((WIDTH / 2) / Math.abs(dx || 1e-6), (HEIGHT / 2) / Math.abs(dy || 1e-6), 1);
  return {x: position.x + dx * scale, y: position.y + dy * scale};
}

function fitView(positions, width, height) {
  const points = Object.values(positions);
  if (!points.length) return {panX: width / 2, panY: height / 2, zoom: 1};
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const zoom = Math.min(1, Math.max(MIN_ZOOM, Math.min(width / (maxX - minX + WIDTH + 60), height / (maxY - minY + HEIGHT + 60))));
  return {panX: width / 2 - zoom * (minX + maxX) / 2, panY: height / 2 - zoom * (minY + maxY) / 2, zoom};
}

// An NCU's dialogue as a graph (see dialogueGraph): NCU lines in yellow,
// player choices in green, quest offers in orange, arrows showing the way
// a conversation can go. Drag boxes to arrange them; drag the dot on an
// arrow to bend it (double-click the dot to straighten). Both are
// reported through onLayoutChange({positions, bends}) when a drag ends.
// Clicking an orange box opens the quest.
export default function DialogueGraphCanvas({graph, layout, onLayoutChange, onOpenQuest}) {
  const wrapper = useRef(null);
  const [positions, setPositions] = useState(() => dialogueLayout(graph, layout?.positions));
  const [bends, setBends] = useState(() => layout?.bends ?? {});
  const [view, setView] = useState(null);
  const press = useRef(null);
  const latest = useRef({positions, bends});
  latest.current = {positions, bends};

  // Newly added nodes get a place; known ones keep theirs.
  const placed = useMemo(() => dialogueLayout(graph, positions), [graph, positions]);
  const current = view ?? fitView(placed, 600, 320);

  const nodesById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);

  const pinchHandlers = usePinchZoom(wrapper, {zoom: current.zoom, offset: {x: current.panX, y: current.panY}}, {
    clampZoom: (zoom) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)),
    onPinch: ({zoom, offset}) => setView({zoom, panX: offset.x, panY: offset.y}),
    onPinchStart: () => { press.current = null; },
  });

  const toGraph = (e) => {
    const rect = wrapper.current.getBoundingClientRect();
    return {x: (e.clientX - rect.left - current.panX) / current.zoom, y: (e.clientY - rect.top - current.panY) / current.zoom};
  };

  const report = () => onLayoutChange?.({positions: latest.current.positions, bends: latest.current.bends});

  function onPointerDown(e, target = null) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    press.current = {target, startX: e.clientX, startY: e.clientY, moved: false, view: current, grab: target ? toGraph(e) : null, from: target?.node ? placed[target.node.id] : null};
  }

  function onPointerMove(e) {
    const p = press.current;
    if (!p) return;
    const dx = e.clientX - p.startX;
    const dy = e.clientY - p.startY;
    if (Math.hypot(dx, dy) > CLICK_SLOP) p.moved = true;
    if (!p.moved) return;
    if (p.target?.node) {
      const at = toGraph(e);
      setPositions({...placed, [p.target.node.id]: {x: Math.round(p.from.x + at.x - p.grab.x), y: Math.round(p.from.y + at.y - p.grab.y)}});
    } else if (p.target?.edge) {
      const at = toGraph(e);
      setBends((b) => ({...b, [edgeKey(p.target.edge)]: {x: Math.round(at.x), y: Math.round(at.y)}}));
    } else {
      setView({...p.view, panX: p.view.panX + dx, panY: p.view.panY + dy});
    }
  }

  function onPointerUp() {
    const p = press.current;
    press.current = null;
    if (!p) return;
    if (p.target && p.moved) report();
    else if (p.target?.node?.kind === "quest") onOpenQuest?.(p.target.node.identifier);
  }

  function straighten(edge) {
    const {[edgeKey(edge)]: _dropped, ...rest} = latest.current.bends;
    latest.current = {...latest.current, bends: rest};
    setBends(rest);
    report();
  }

  function onWheel(e) {
    const rect = wrapper.current.getBoundingClientRect();
    const [x, y] = [e.clientX - rect.left, e.clientY - rect.top];
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
    setView({zoom, panX: x - (x - current.panX) * (zoom / current.zoom), panY: y - (y - current.panY) * (zoom / current.zoom)});
  }

  return (
    <div className="dialogue-graph" ref={wrapper} {...pinchHandlers} onPointerDown={(e) => onPointerDown(e)} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onWheel={onWheel}>
      <svg width="100%" height="100%" role="img" aria-label="Dialogue graph">
        <defs>
          <marker id="dialogue-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={STROKE} />
          </marker>
        </defs>
        <g transform={`translate(${current.panX} ${current.panY}) scale(${current.zoom})`}>
          {graph.edges.map((edge) => {
            const [a, b] = [placed[edge.from], placed[edge.to]];
            if (!a || !b) return null;
            const bend = bends[edgeKey(edge)];
            const start = anchor(a, bend ?? b);
            const end = anchor(b, bend ?? a);
            const handle = bend ?? {x: (start.x + end.x) / 2, y: (start.y + end.y) / 2};
            const points = bend ? [start, bend, end] : [start, end];
            return (
              <g key={edgeKey(edge)}>
                <polyline className="dialogue-graph-edge" points={points.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={STROKE} strokeWidth={2} markerEnd="url(#dialogue-arrow)" />
                <circle className="dialogue-graph-bend" cx={handle.x} cy={handle.y} r={6} onPointerDown={(e) => onPointerDown(e, {edge})} onDoubleClick={() => straighten(edge)} />
              </g>
            );
          })}
          {graph.nodes.map((node) => {
            const at = placed[node.id];
            if (!at) return null;
            return (
              <g key={node.id} className={`dialogue-graph-node dialogue-graph-${node.kind}`} transform={`translate(${at.x} ${at.y})`}
                onPointerDown={(e) => onPointerDown(e, {node})} role="button" aria-label={`${node.kind} ${node.text}`}>
                <title>{node.text}</title>
                <rect x={-WIDTH / 2} y={-HEIGHT / 2} width={WIDTH} height={HEIGHT} rx={node.kind === "start" ? HEIGHT / 2 : 6} />
                <text textAnchor="middle" dominantBaseline="central">{node.kind === "start" ? "Start" : clip(node.text)}</text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
