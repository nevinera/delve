import {useEffect, useMemo, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {keyFromRef} from "./mapRef";
import {circleLayout, NODE_RADIUS} from "./circleLayout";
import {connectionStatus} from "./connectionStatus";
import {computeFitView, MIN_ZOOM, MAX_ZOOM} from "./graphView";

// Positioned near the cursor via a portal, same approach as
// AbilityTooltip.jsx - a native SVG <title> tooltip is slow to appear and
// can't be styled, so ports get this instead.
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

// A square this size, however an image's aspect ratio fits into it, always
// has a diagonal <= the node's own diameter (2 * NODE_RADIUS) - see the
// thumbnail <image>'s own comment below for why that guarantees no
// circular clipping.
const NODE_THUMB_SIZE = (NODE_RADIUS * 2) / Math.SQRT2;

const PORT_RADIUS = 6;
// World-space distance within which a drag-drop counts as "on" a port -
// generous enough to not require pixel-perfect aim, small enough that two
// ports on the same node (which sit NODE_RADIUS apart, at minimum) never
// both qualify.
const HIT_RADIUS = 16;
const ZOOM_STEP = 1.25;

const STATUS_COLOR = {
  open: "#567",
  entryPoint: "#4a7",
  openConnection: "#a94",
  zoneLink: "#59c",
};

// Nodes = referenced maps, ports = each map's own connections evenly
// spaced around its node's boundary, edges = zoneLinks between two ports
// (see plans/zone-editor.md step 6). Node positions start from
// circleLayout's default (no persisted layout metadata exists until step
// 11) and are freely drag-adjustable - those adjustments live only in this
// component's own state for now, lost on reload, same as every other draft
// edit before step 11's save. Dragging from one port to another creates a
// zoneLink (ADD_ZONE_LINK); dragging an already-linked port to empty space
// removes it (REMOVE_ZONE_LINK) - the same reducer actions
// ZoneMapConnectionsPanel's "+ Link to"/"Remove Link" already use, so both
// UIs stay in sync automatically.
export default function ZoneGraphCanvas({zoneData, mapDetailsByKey, dispatch}) {
  const containerRef = useRef(null);
  const [positions, setPositions] = useState({}); // {[nodeKey]: {x, y}} - drag overrides
  const [view, setView] = useState({panX: 0, panY: 0, zoom: 1});
  const [nodeDrag, setNodeDrag] = useState(null);
  const [pan, setPan] = useState(null);
  const [linkDrag, setLinkDrag] = useState(null); // {fromKey, fromMapIdentifier, fromConnection, fromStatus, x, y}
  const [portTooltip, setPortTooltip] = useState(null); // {x, y, label} - x/y are screen (clientX/Y), not world, coords

  const nodes = useMemo(
    () =>
      zoneData.maps
        .map((entry) => {
          const key = entry?.$ref ? keyFromRef(entry.$ref) : null;
          const detail = key ? mapDetailsByKey[key] : null;
          return {key, detail, name: detail?.name ?? entry?.name ?? key ?? "?"};
        })
        .filter((node) => node.key),
    [zoneData.maps, mapDetailsByKey]
  );

  const defaultPositions = useMemo(() => circleLayout(nodes.map((n) => n.key)), [nodes]);

  function nodePosition(key) {
    return positions[key] ?? defaultPositions[key] ?? {x: 0, y: 0};
  }

  // Every port on every node, with its resolved world position and current
  // status - the one list both rendering and link drag/drop hit-testing
  // read from.
  const ports = useMemo(() => {
    // A linked port's angle points at whichever node it's connected to
    // (see below) - needs a way to look up that other node by the map
    // identifier a zoneLink names, not by file key.
    const nodesByIdentifier = new Map(nodes.filter((n) => n.detail?.identifier).map((n) => [n.detail.identifier, n]));

    const list = [];
    for (const node of nodes) {
      const connections = node.detail?.connections ?? [];
      const {x: cx, y: cy} = nodePosition(node.key);
      connections.forEach((connection, i) => {
        const status = node.detail?.identifier
          ? connectionStatus(node.detail.identifier, connection.identifier, zoneData)
          : {type: "open"};

        // A linked port sits on the side of its node facing whatever it's
        // connected to, recomputed from both nodes' current positions -
        // so it tracks either end being dragged. Anything unlinked (open/
        // entryPoint/openConnection) has no "other node" to face, so it
        // keeps the even-spacing-by-index fallback.
        let angle;
        const otherNode = status.type === "zoneLink" ? nodesByIdentifier.get(status.otherSide?.map) : null;
        if (otherNode) {
          const other = nodePosition(otherNode.key);
          angle = Math.atan2(other.y - cy, other.x - cx);
        } else {
          angle = (i / connections.length) * 2 * Math.PI;
        }

        list.push({
          nodeKey: node.key,
          mapIdentifier: node.detail?.identifier,
          connectionIdentifier: connection.identifier,
          x: cx + NODE_RADIUS * Math.cos(angle),
          y: cy + NODE_RADIUS * Math.sin(angle),
          status,
        });
      });
    }
    return list;
    // nodePosition reads `positions` (drag overrides) and defaultPositions
    // via closure - both already listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, defaultPositions, positions, zoneData]);

  function screenToWorld(clientX, clientY) {
    const rect = containerRef.current?.getBoundingClientRect() ?? {left: 0, top: 0};
    return {x: (clientX - rect.left - view.panX) / view.zoom, y: (clientY - rect.top - view.panY) / view.zoom};
  }

  function nearestPort(worldX, worldY, exclude) {
    let best = null;
    let bestDist = HIT_RADIUS;
    for (const port of ports) {
      if (port.nodeKey === exclude.fromKey && port.connectionIdentifier === exclude.fromConnection) continue;
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

  // Centers the view on the mean of every node's current position, zoomed
  // out just enough that they're all visible - the default view (see the
  // mount effect below) and what the toolbar's Reset button recomputes on
  // demand. No-ops if the wrapper hasn't been measured yet (zero size - a
  // real browser always has one once laid out; a test environment with no
  // real layout never does, which is fine - it just keeps whatever view
  // state it already had).
  function fitView() {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const fit = computeFitView(nodes.map((node) => nodePosition(node.key)), rect.width, rect.height);
    if (fit) setView(fit);
  }

  const nodeKeysSignature = nodes.map((node) => node.key).join(",");
  useEffect(() => {
    fitView();
    // Only when the set of maps changes (added/removed) - not on every
    // render, and deliberately not on every node drag (positions), which
    // would fight a manual drag by re-centering under it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeKeysSignature]);

  function handlePortMouseEnter(e, port) {
    setPortTooltip({x: e.clientX, y: e.clientY, label: port.connectionIdentifier});
  }

  function handlePortMouseMove(e) {
    setPortTooltip((current) => (current ? {...current, x: e.clientX, y: e.clientY} : current));
  }

  function handlePortMouseLeave() {
    setPortTooltip(null);
  }

  // Only ever reached when the pointerdown wasn't already claimed (and
  // stopped) by a node or port below - i.e. a genuine background click.
  function handleBackgroundPointerDown(e) {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setPan({pointerId: e.pointerId, startClientX: e.clientX, startClientY: e.clientY, startPanX: view.panX, startPanY: view.panY});
  }

  function handleNodePointerDown(e, node) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const {x, y} = nodePosition(node.key);
    setNodeDrag({key: node.key, pointerId: e.pointerId, startClientX: e.clientX, startClientY: e.clientY, startX: x, startY: y});
  }

  function handlePortPointerDown(e, port) {
    if (!port.mapIdentifier) return; // can't create/remove a link without a resolved map identifier
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setLinkDrag({fromKey: port.nodeKey, fromMapIdentifier: port.mapIdentifier, fromConnection: port.connectionIdentifier, fromStatus: port.status, x: port.x, y: port.y});
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
        dispatch({
          type: "ADD_ZONE_LINK",
          connectionA: {map: linkDrag.fromMapIdentifier, connection: linkDrag.fromConnection},
          connectionB: {map: target.mapIdentifier, connection: target.connectionIdentifier},
        });
      } else if (linkDrag.fromStatus?.type === "zoneLink") {
        dispatch({type: "REMOVE_ZONE_LINK", index: linkDrag.fromStatus.linkIndex});
      }
      setLinkDrag(null);
    }
  }

  const edges = (zoneData.zoneLinks ?? [])
    .map((link, index) => {
      const a = ports.find((p) => p.mapIdentifier === link.connectionA?.map && p.connectionIdentifier === link.connectionA?.connection);
      const b = ports.find((p) => p.mapIdentifier === link.connectionB?.map && p.connectionIdentifier === link.connectionB?.connection);
      return a && b ? {index, a, b} : null;
    })
    .filter(Boolean);

  const dragOrigin = linkDrag && ports.find((p) => p.nodeKey === linkDrag.fromKey && p.connectionIdentifier === linkDrag.fromConnection);

  return (
    <div className="zone-graph-panel">
      <div className="zone-graph-toolbar">
        <button type="button" onClick={() => zoomBy(1 / ZOOM_STEP)}>−</button>
        <button type="button" onClick={fitView}>Reset</button>
        <button type="button" onClick={() => zoomBy(ZOOM_STEP)}>+</button>
      </div>
      {nodes.length === 0 ? (
        <p className="map-sidebar-hint">No maps yet.</p>
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
                const clipId = `zone-graph-node-clip-${node.key}`;
                return (
                  <g key={node.key} transform={`translate(${x}, ${y})`} data-node-key={node.key}>
                    <circle className="zone-graph-node" r={NODE_RADIUS} onPointerDown={(e) => handleNodePointerDown(e, node)} />
                    {node.detail?.thumbnailUrl ? (
                      <>
                        <clipPath id={clipId}>
                          <circle r={NODE_RADIUS} />
                        </clipPath>
                        {/* "meet" fits the image into its box preserving
                            aspect ratio, but a box sized to the full
                            diameter still lets a fitted rectangle's
                            corners stick out past the circle (e.g. a
                            landscape image touching the left/right edges
                            has taller corners than the circle allows at
                            that x). Sizing the box to diameter/√2 instead
                            means the worst case - a square image filling
                            the box exactly - has a diagonal exactly equal
                            to the circle's diameter, so it (and every
                            other aspect ratio, which fits even smaller)
                            always lands fully inside with no clipping. */}
                        <image
                          className="zone-graph-node-thumb"
                          href={node.detail.thumbnailUrl}
                          x={-NODE_THUMB_SIZE / 2}
                          y={-NODE_THUMB_SIZE / 2}
                          width={NODE_THUMB_SIZE}
                          height={NODE_THUMB_SIZE}
                          preserveAspectRatio="xMidYMid meet"
                          clipPath={`url(#${clipId})`}
                          pointerEvents="none"
                        />
                      </>
                    ) : (
                      <text className="zone-graph-node-thumb-placeholder" textAnchor="middle" dominantBaseline="central" pointerEvents="none">
                        🗺
                      </text>
                    )}
                    <text className="zone-graph-node-label" y={NODE_RADIUS + 14} textAnchor="middle">{node.name}</text>
                  </g>
                );
              })}
              {ports.map((port) => (
                <circle
                  key={`${port.nodeKey}/${port.connectionIdentifier}`}
                  className="zone-graph-port"
                  cx={port.x}
                  cy={port.y}
                  r={PORT_RADIUS}
                  fill={STATUS_COLOR[port.status.type] ?? STATUS_COLOR.open}
                  data-node-key={port.nodeKey}
                  data-connection={port.connectionIdentifier}
                  data-status={port.status.type}
                  onPointerDown={(e) => handlePortPointerDown(e, port)}
                  onMouseEnter={(e) => handlePortMouseEnter(e, port)}
                  onMouseMove={handlePortMouseMove}
                  onMouseLeave={handlePortMouseLeave}
                />
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
