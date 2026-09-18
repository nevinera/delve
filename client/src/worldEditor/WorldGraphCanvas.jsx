import {useEffect, useMemo, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {circleLayout, NODE_RADIUS} from "./circleLayout";
import {worldLinkStatus, worldEntryPointKey} from "./worldLinkStatus";
import {computeFitView, MIN_ZOOM, MAX_ZOOM} from "./graphView";

const TOOLTIP_STYLE = {
  position: "fixed",
  zIndex: 100,
  background: "rgba(20,16,12,0.97)",
  border: "1px solid #556",
  borderRadius: 6,
  padding: "4px 8px",
  color: "#cce",
  fontSize: 12,
  pointerEvents: "none",
};

const PORT_RADIUS = 6;
const HIT_RADIUS = 16;
const ZOOM_STEP = 1.25;
const ENTRY_POINT_HIGHLIGHT = "#ffd54a";

// A world entry point's own small "portal" node (see plans/zone-editor.md's
// identical satellite for a zone's own entryPoint/openConnection) - only
// for a port that's actually this world's designated entry point for its
// zone (World.entryPoints), not every raw entryPoint a zone happens to
// expose. Its only real job is to be draggable somewhere, so the matched
// port on the zone node can be pulled to face it.
const SATELLITE_RADIUS = 14;
const SATELLITE_GAP = 24;

// Fill color by "<kind>:<status.type>" - a zone's entryPoints get their own
// (green-ish) colors distinct from openConnections, since they're a
// different pool of connection points.
const STATUS_COLOR = {
  "open:open": "#567",
  "open:worldLink": "#59c",
  "entryPoint:open": "#4a7",
  "entryPoint:worldLink": "#2a9d8f",
};

function portKey(nodeKey, kind, connection) {
  return `${nodeKey}/${kind}/${connection}`;
}

function satelliteKeyFor(nodeKey, connection) {
  return `entryPoint:${nodeKey}/${connection}`;
}

// Nodes = referenced zones, ports = each zone's own exposed connection
// points - both its openConnections (by exposed name) and its entryPoints
// (by their own raw "mapId/connectionId" key) - evenly spaced around its
// node's boundary, edges = worldLinks between two ports. One level up from
// ZoneGraphCanvas's map/connection graph, and simpler than it in most
// respects (a zone's address here is already the key this world's own
// `zones` dict uses - no file-key -> identifier indirection to resolve) -
// except a port that's this world's own designated entry point for its
// zone (World.entryPoints, keyed by worldEntryPointKey - the actual
// "portal" a character spawns through), which gets its own draggable
// satellite node exactly like ZoneGraphCanvas's entryPoint/openConnection
// satellites do, tethered to the port, plus a gold highlight ring. A
// zone's *other* entryPoints (real connection points, but not chosen as
// this world's entry) stay plain ring ports, same as an openConnection -
// only the ones actually promoted to a world entry point are portals.
// Dragging from one port to another creates a worldLink; dragging an
// already-linked port to empty space removes it - same drag-drop
// interaction ZoneGraphCanvas's own ports use.
export default function WorldGraphCanvas({draft, onChange, zoneDetailsByKey, onRefresh, refreshStatus, initialPositions, onPositionsChange}) {
  const containerRef = useRef(null);
  // {[zoneKey|satelliteKey]: {x, y}} - drag overrides, seeded from
  // persisted layout metadata (see layoutMetadata.js/saveWorld.js), loaded
  // back in by WorldEditor. onPositionsChange, if given, is then called
  // with the current drag-override map every time it changes - lets a
  // caller observe the live layout for generating that same metadata on
  // save, without this component needing to know anything about
  // persistence itself - same contract ZoneGraphCanvas's own
  // initialPositions/onPositionsChange has.
  const [positions, setPositions] = useState(initialPositions ?? {});
  const [view, setView] = useState({panX: 0, panY: 0, zoom: 1});
  const [nodeDrag, setNodeDrag] = useState(null);
  const [pan, setPan] = useState(null);
  const [linkDrag, setLinkDrag] = useState(null); // {fromKey, fromKind, fromConnection, fromStatus, x, y}
  const [portTooltip, setPortTooltip] = useState(null);

  const worldData = draft.data;
  const zones = worldData.zones ?? {};
  const worldEntryPointKeys = new Set(Object.keys(worldData.entryPoints ?? {}));

  const nodes = useMemo(
    () => Object.keys(zones).map((key) => ({key, name: zones[key]?.name || key, detail: zoneDetailsByKey[key]})),
    [zones, zoneDetailsByKey]
  );

  const defaultPositions = useMemo(() => circleLayout(nodes.map((n) => n.key)), [nodes]);

  function nodePosition(key) {
    return positions[key] ?? defaultPositions[key] ?? {x: 0, y: 0};
  }

  useEffect(() => {
    onPositionsChange?.(positions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions]);

  const {ports, satellites} = useMemo(() => {
    const portList = [];
    const satelliteList = [];
    for (const node of nodes) {
      const connections = [
        ...Object.values(node.detail?.openConnections ?? {}).map((connection) => ({kind: "open", connection})),
        ...Object.keys(node.detail?.entryPoints ?? {}).map((connection) => ({kind: "entryPoint", connection})),
      ];
      const {x: cx, y: cy} = nodePosition(node.key);
      connections.forEach(({kind, connection}, i) => {
        const status = worldLinkStatus(node.key, kind, connection, worldData.worldLinks);
        const fallbackAngle = (i / connections.length) * 2 * Math.PI;
        const isWorldEntryPoint = kind === "entryPoint" && worldEntryPointKeys.has(worldEntryPointKey(node.key, connection));

        // A linked port faces whatever it's connected to. A port that's
        // this world's own designated entry point for its zone (the
        // "portal" a character actually spawns through - see
        // docs/schema/world.md's entryPoints) gets its own small
        // satellite, draggable independently - same split ZoneGraphCanvas's
        // own ports make between a zoneLink and an entryPoint/openConnection.
        // A zone's *other* entryPoints (not chosen as this world's own)
        // are just ordinary ring ports, same as an openConnection - only
        // the ones actually promoted to a world entry point are portals.
        let angle = fallbackAngle;
        if (status.type === "worldLink") {
          const other = nodes.find((n) => n.key === status.otherSide?.zone);
          if (other) {
            const otherPos = nodePosition(other.key);
            angle = Math.atan2(otherPos.y - cy, otherPos.x - cx);
          }
        } else if (isWorldEntryPoint) {
          const satelliteKey = satelliteKeyFor(node.key, connection);
          const distance = NODE_RADIUS + SATELLITE_GAP;
          const defaultPos = {x: cx + distance * Math.cos(fallbackAngle), y: cy + distance * Math.sin(fallbackAngle)};
          const satellitePos = positions[satelliteKey] ?? defaultPos;
          angle = Math.atan2(satellitePos.y - cy, satellitePos.x - cx);
          satelliteList.push({
            satelliteKey,
            x: satellitePos.x,
            y: satellitePos.y,
            label: connection,
            portX: cx + NODE_RADIUS * Math.cos(angle),
            portY: cy + NODE_RADIUS * Math.sin(angle),
          });
        }

        portList.push({
          nodeKey: node.key,
          kind,
          connection,
          isWorldEntryPoint,
          x: cx + NODE_RADIUS * Math.cos(angle),
          y: cy + NODE_RADIUS * Math.sin(angle),
          status,
        });
      });
    }
    return {ports: portList, satellites: satelliteList};
    // nodePosition reads `positions`/defaultPositions via closure - both
    // already listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, defaultPositions, positions, worldData.worldLinks, worldEntryPointKeys]);

  function screenToWorld(clientX, clientY) {
    const rect = containerRef.current?.getBoundingClientRect() ?? {left: 0, top: 0};
    return {x: (clientX - rect.left - view.panX) / view.zoom, y: (clientY - rect.top - view.panY) / view.zoom};
  }

  function nearestPort(worldX, worldY, exclude) {
    let best = null;
    let bestDist = HIT_RADIUS;
    for (const port of ports) {
      if (port.nodeKey === exclude.fromKey && port.kind === exclude.fromKind && port.connection === exclude.fromConnection) continue;
      const dist = Math.hypot(port.x - worldX, port.y - worldY);
      if (dist <= bestDist) {
        best = port;
        bestDist = dist;
      }
    }
    return best;
  }

  function zoomBy(factor) {
    setView((v) => ({...v, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor))}));
  }

  function handleWheel(e) {
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
  }

  function fitView() {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const points = [...nodes.map((node) => nodePosition(node.key)), ...satellites.map((s) => ({x: s.x, y: s.y}))];
    const fit = computeFitView(points, rect.width, rect.height);
    if (fit) setView(fit);
  }

  const nodeKeysSignature = nodes.map((node) => node.key).join(",");
  useEffect(() => {
    fitView();
    // Only when the set of zones changes - not on every node drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeKeysSignature]);

  function tooltipLabel(port) {
    return port.kind === "entryPoint" ? `${port.connection} (entry point)` : port.connection;
  }

  function handlePortMouseEnter(e, port) {
    setPortTooltip({x: e.clientX, y: e.clientY, label: tooltipLabel(port)});
  }

  function handlePortMouseMove(e) {
    setPortTooltip((current) => (current ? {...current, x: e.clientX, y: e.clientY} : current));
  }

  function handlePortMouseLeave() {
    setPortTooltip(null);
  }

  function handleBackgroundPointerDown(e) {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setPan({pointerId: e.pointerId, startClientX: e.clientX, startClientY: e.clientY, startPanX: view.panX, startPanY: view.panY});
  }

  // Shared by a zone node and a satellite node (entry point) - both are
  // just "a positioned thing with a draggable key" as far as dragging
  // itself is concerned; only their default position and how a port reacts
  // to them differs (see the ports/satellites memo above).
  function startElementDrag(e, key, pos) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setNodeDrag({key, pointerId: e.pointerId, startClientX: e.clientX, startClientY: e.clientY, startX: pos.x, startY: pos.y});
  }

  function handleNodePointerDown(e, node) {
    startElementDrag(e, node.key, nodePosition(node.key));
  }

  function handleSatellitePointerDown(e, satellite) {
    startElementDrag(e, satellite.satelliteKey, {x: satellite.x, y: satellite.y});
  }

  function handlePortPointerDown(e, port) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setLinkDrag({fromKey: port.nodeKey, fromKind: port.kind, fromConnection: port.connection, fromStatus: port.status, x: port.x, y: port.y});
  }

  function handlePointerMove(e) {
    if (pan && e.pointerId === pan.pointerId) {
      setView((v) => ({...v, panX: pan.startPanX + (e.clientX - pan.startClientX), panY: pan.startPanY + (e.clientY - pan.startClientY)}));
      return;
    }
    if (nodeDrag && e.pointerId === nodeDrag.pointerId) {
      const dx = (e.clientX - nodeDrag.startClientX) / view.zoom;
      const dy = (e.clientY - nodeDrag.startClientY) / view.zoom;
      setPositions((current) => ({...current, [nodeDrag.key]: {x: nodeDrag.startX + dx, y: nodeDrag.startY + dy}}));
      return;
    }
    if (linkDrag) {
      const {x, y} = screenToWorld(e.clientX, e.clientY);
      setLinkDrag((current) => ({...current, x, y}));
      const hovered = nearestPort(x, y, linkDrag);
      setPortTooltip(hovered ? {x: e.clientX, y: e.clientY, label: tooltipLabel(hovered)} : null);
    }
  }

  function handlePointerUp(e) {
    if (pan && e.pointerId === pan.pointerId) {
      setPan(null);
      return;
    }
    if (nodeDrag && e.pointerId === nodeDrag.pointerId) {
      setNodeDrag(null);
      return;
    }
    if (linkDrag) {
      const target = nearestPort(linkDrag.x, linkDrag.y, linkDrag);
      if (target) {
        onChange(draft.addWorldLink(
          {zone: linkDrag.fromKey, kind: linkDrag.fromKind, connection: linkDrag.fromConnection},
          {zone: target.nodeKey, kind: target.kind, connection: target.connection}
        ));
      } else if (linkDrag.fromStatus?.type === "worldLink") {
        onChange(draft.removeWorldLink(linkDrag.fromStatus.linkIndex));
      }
      setLinkDrag(null);
      setPortTooltip(null);
    }
  }

  const edges = (worldData.worldLinks ?? [])
    .map((link, index) => {
      const a = ports.find((p) => p.nodeKey === link.zoneA?.zone && p.kind === link.zoneA?.kind && p.connection === link.zoneA?.connection);
      const b = ports.find((p) => p.nodeKey === link.zoneB?.zone && p.kind === link.zoneB?.kind && p.connection === link.zoneB?.connection);
      return a && b ? {index, a, b} : null;
    })
    .filter(Boolean);

  const dragOrigin = linkDrag && ports.find((p) => p.nodeKey === linkDrag.fromKey && p.kind === linkDrag.fromKind && p.connection === linkDrag.fromConnection);

  return (
    <div className="zone-graph-panel">
      <div className="zone-graph-toolbar">
        <button type="button" onClick={() => zoomBy(1 / ZOOM_STEP)}>−</button>
        <button type="button" onClick={fitView}>Reset</button>
        <button type="button" onClick={() => zoomBy(ZOOM_STEP)}>+</button>
        <button type="button" onClick={onRefresh}>↻ Refresh Connections</button>
        {refreshStatus && <span className="zone-connection-status-label">{refreshStatus}</span>}
      </div>
      {nodes.length === 0 ? (
        <p className="map-sidebar-hint">No zones yet.</p>
      ) : (
        <div className="zone-graph-wrapper" ref={containerRef} onPointerDown={handleBackgroundPointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onWheel={handleWheel}>
          <svg className="zone-graph-svg" width="100%" height="100%">
            <g transform={`translate(${view.panX}, ${view.panY}) scale(${view.zoom})`}>
              {edges.map(({index, a, b}) => (
                <line key={index} className="zone-graph-edge" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
              ))}
              {linkDrag && (
                <line className="zone-graph-drag-line" x1={dragOrigin?.x ?? linkDrag.x} y1={dragOrigin?.y ?? linkDrag.y} x2={linkDrag.x} y2={linkDrag.y} />
              )}
              {nodes.map((node) => {
                const {x, y} = nodePosition(node.key);
                return (
                  <g key={node.key} transform={`translate(${x}, ${y})`} data-node-key={node.key}>
                    <circle className="zone-graph-node" r={NODE_RADIUS} onPointerDown={(e) => handleNodePointerDown(e, node)} />
                    <text className="zone-graph-node-thumb-placeholder" textAnchor="middle" dominantBaseline="central" pointerEvents="none">🌍</text>
                    <text className="zone-graph-node-label" y={NODE_RADIUS + 14} textAnchor="middle">{node.name}</text>
                  </g>
                );
              })}
              {ports.map((port) => (
                <circle
                  key={portKey(port.nodeKey, port.kind, port.connection)}
                  className="zone-graph-port"
                  cx={port.x}
                  cy={port.y}
                  r={PORT_RADIUS}
                  fill={STATUS_COLOR[`${port.kind}:${port.status.type}`] ?? STATUS_COLOR["open:open"]}
                  stroke={port.isWorldEntryPoint ? ENTRY_POINT_HIGHLIGHT : "#000"}
                  strokeWidth={port.isWorldEntryPoint ? 3 : 1}
                  data-node-key={port.nodeKey}
                  data-kind={port.kind}
                  data-connection={port.connection}
                  data-status={port.status.type}
                  data-world-entry-point={port.isWorldEntryPoint}
                  onPointerDown={(e) => handlePortPointerDown(e, port)}
                  onMouseEnter={(e) => handlePortMouseEnter(e, port)}
                  onMouseMove={handlePortMouseMove}
                  onMouseLeave={handlePortMouseLeave}
                />
              ))}
              {satellites.map((satellite) => (
                <g key={satellite.satelliteKey}>
                  <line
                    className="zone-graph-satellite-tether"
                    x1={satellite.portX}
                    y1={satellite.portY}
                    x2={satellite.x}
                    y2={satellite.y}
                  />
                  <circle
                    className="zone-graph-satellite"
                    cx={satellite.x}
                    cy={satellite.y}
                    r={SATELLITE_RADIUS}
                    fill={STATUS_COLOR["entryPoint:open"]}
                    data-satellite-key={satellite.satelliteKey}
                    onPointerDown={(e) => handleSatellitePointerDown(e, satellite)}
                  />
                  <text className="zone-graph-satellite-label" x={satellite.x} y={satellite.y + SATELLITE_RADIUS + 12} textAnchor="middle">
                    {satellite.label}
                  </text>
                </g>
              ))}
            </g>
          </svg>
        </div>
      )}
      {portTooltip && createPortal(
        <div style={{...TOOLTIP_STYLE, left: portTooltip.x + 12, top: portTooltip.y + 12}}>{portTooltip.label}</div>,
        document.body
      )}
    </div>
  );
}
