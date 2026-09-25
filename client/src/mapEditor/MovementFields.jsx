import {PATROL_CHOOSE_OPTIONS} from "./mapFieldOptions";

// Position and movement editing shared by UnitsPanel and NcusPanel - a
// unit and an NCU move identically (see docs/schema/ncu.md). Each takes
// placements already narrowed to its own panel's section, so an index
// match here always means this entry.

function round1(n) {
  return Math.round(n * 10) / 10;
}

export function PositionButton({unitIndex, position, unitPlacement, onStartUnitPlacement}) {
  const isPlacingHere = unitPlacement?.unitIndex === unitIndex;
  return (
    <button
      type="button" className={`map-point-pill map-unit-position-btn${isPlacingHere ? " map-point-pill-pending" : ""}`}
      disabled={isPlacingHere}
      onClick={() => onStartUnitPlacement(unitIndex)}
    >
      {isPlacingHere ? "…" : `${round1(position.x)}, ${round1(position.y)}`}
    </button>
  );
}

// Switching movement type replaces the whole `movement` object (not a
// merge - old patrol steps/wander fields shouldn't linger under a
// different type), matching every other nested-object field in this
// editor (position/lootTable) that's always dispatched whole.
function defaultMovementFor(type, unit) {
  if (type === "patrol") {
    // The first step is the unit's own starting position - see PatrolFields,
    // where it's the one step that can't be removed or have anything
    // inserted before it.
    return {
      type: "patrol", choose: "loop",
      steps: [{position: {x: unit.position.x, y: unit.position.y, angle: unit.position.angle ?? 0}, movementRate: 0.5, waitTime: 1}],
    };
  }
  if (type === "wander") return {type: "wander", location: {x: unit.position.x, y: unit.position.y}, radius: 10, speed: 0.3, waitTime: 1};
  return {type: "still"};
}

export function MovementTypeSelect({unit, unitIndex, dispatch, section = "units"}) {
  return (
    <select
      value={unit.movement?.type ?? "still"}
      onChange={(e) => dispatch({
        type: "UPDATE_ENTRY_FIELD", section, index: unitIndex, field: "movement",
        value: defaultMovementFor(e.target.value, unit),
      })}
    >
      <option value="still">Still</option>
      <option value="patrol">Patrol</option>
      <option value="wander">Wander</option>
    </select>
  );
}

// Mirrors PositionButton, but for one patrol step - clicking it starts
// *edit* placement for just that step (see MapEditor's
// startPatrolStepPlacement/placePatrolStep).
function PatrolStepPill({unitIndex, stepIndex, position, patrolStepPlacement, onStartPatrolStepEdit, onHoverPatrolStep}) {
  const isPlacingHere = patrolStepPlacement?.unitIndex === unitIndex && patrolStepPlacement?.stepIndex === stepIndex && patrolStepPlacement?.mode === "edit";
  return (
    <button
      type="button" className={`map-point-pill map-patrol-step-pill${isPlacingHere ? " map-point-pill-pending" : ""}`}
      disabled={isPlacingHere}
      onClick={() => onStartPatrolStepEdit(unitIndex, stepIndex)}
      onMouseEnter={() => onHoverPatrolStep?.({unitIndex, stepIndex})}
      onMouseLeave={() => onHoverPatrolStep?.(null)}
    >
      {isPlacingHere ? "…" : `${round1(position.x)}, ${round1(position.y)}`}
    </button>
  );
}

// Steps are append-only (+ Add Step arms single-shot "insert" placement,
// same as every other add-tool here) but insert mode auto-advances to the
// next step on each map click, same as a wall's points - so laying out a
// multi-step patrol is a run of clicks, not one button press per step.
// movementRate/waitTime are typed fields (waitTime edits a fixed number,
// not a [min, max] range, matching this editor's existing lootCount/HP
// precedent of not supporting ranges yet).
// A "+" before/between/after every step, same convention as BarriersPanel's
// WallPoints - clicking one starts insert placement at that gap (see
// MapEditor's patrolStepPlacement/placePatrolStep), and insert mode
// auto-advances to the gap right after the point just placed, so a run of
// clicks lays down consecutive waypoints starting from wherever you clicked
// "+". Unlike WallPoints' compact inline pills, a step carries more fields
// (rate/wait/remove) so each renders as its own row, with the "+" buttons
// as their own rows in between rather than inline.
function PatrolFields({unit, unitIndex, patrolStepPlacement, onStartPatrolStepPlacement, onStartPatrolStepEdit, onHoverPatrolStep, onUpdateMovement}) {
  const movement = unit.movement;
  const steps = movement.steps ?? [];
  const isPlacingNew = patrolStepPlacement?.unitIndex === unitIndex && patrolStepPlacement?.mode === "insert";
  const insertingAt = isPlacingNew ? patrolStepPlacement.stepIndex : null;

  function updateStep(i, fields) {
    onUpdateMovement(unitIndex, {steps: steps.map((s, si) => (si === i ? {...s, ...fields} : s))});
  }

  function removeStep(i) {
    onUpdateMovement(unitIndex, {steps: steps.filter((_, si) => si !== i)});
  }

  function PlusButton({insertIndex}) {
    return (
      <button
        type="button" className="map-point-plus" disabled={isPlacingNew}
        onClick={() => onStartPatrolStepPlacement(unitIndex, insertIndex, "insert")}
      >
        +
      </button>
    );
  }

  // Step 0 is the unit's own starting position (seeded there when patrol is
  // first chosen - see defaultMovementFor), so unlike every later step it
  // can't be removed, and there's no "+" before it to insert one earlier.
  // The one exception is a patrol unit with zero steps at all (hand-authored
  // data predating this rule) - that edge case still needs some way to
  // bootstrap a first step, so the leading "+" only appears then.
  const rows = [];
  if (steps.length === 0) {
    rows.push(<PlusButton key="plus-0" insertIndex={0} />);
    if (insertingAt === 0) rows.push(<div key="pending-0" className="map-patrol-step-pending">…</div>);
  }
  steps.forEach((step, i) => {
    rows.push(
      <div key={i} className="map-patrol-step">
        <PatrolStepPill
          unitIndex={unitIndex} stepIndex={i} position={step.position}
          patrolStepPlacement={patrolStepPlacement} onStartPatrolStepEdit={onStartPatrolStepEdit} onHoverPatrolStep={onHoverPatrolStep}
        />
        <label>Rate <input type="number" min="0" max="1" step="0.05" value={step.movementRate} onChange={(e) => updateStep(i, {movementRate: parseFloat(e.target.value) || 0})} /></label>
        <label>Wait <input type="number" min="0" step="0.5" value={step.waitTime} onChange={(e) => updateStep(i, {waitTime: parseFloat(e.target.value) || 0})} /></label>
        {i > 0 && <button type="button" className="map-loot-entry-remove" onClick={() => removeStep(i)}>×</button>}
        <PlusButton insertIndex={i + 1} />
      </div>
    );
    if (insertingAt === i + 1) rows.push(<div key={`pending-${i + 1}`} className="map-patrol-step-pending">…</div>);
  });

  return (
    <div className="map-unit-movement-fields">
      <label className="map-movement-choose">
        Choose{" "}
        <select value={movement.choose ?? "loop"} onChange={(e) => onUpdateMovement(unitIndex, {choose: e.target.value})}>
          {PATROL_CHOOSE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      </label>
      {steps.length === 0 && insertingAt === null && <p className="map-editor-sidebar-placeholder">No steps yet.</p>}
      {rows}
    </div>
  );
}

// Mirrors PositionButton again, for the single wander-zone location.
function WanderLocationButton({unitIndex, location, wanderLocationPlacement, onStartWanderLocationPlacement}) {
  const isPlacingHere = wanderLocationPlacement?.unitIndex === unitIndex;
  return (
    <button
      type="button" className={`map-point-pill map-wander-location-btn${isPlacingHere ? " map-point-pill-pending" : ""}`}
      disabled={isPlacingHere}
      onClick={() => onStartWanderLocationPlacement(unitIndex)}
    >
      {isPlacingHere ? "…" : `${round1(location?.x ?? 0)}, ${round1(location?.y ?? 0)}`}
    </button>
  );
}

function WanderFields({unit, unitIndex, wanderLocationPlacement, onStartWanderLocationPlacement, onUpdateMovement}) {
  const movement = unit.movement;
  return (
    <table>
      <tbody>
        <tr>
          <th>Location</th>
          <td>
            <WanderLocationButton
              unitIndex={unitIndex} location={movement.location}
              wanderLocationPlacement={wanderLocationPlacement} onStartWanderLocationPlacement={onStartWanderLocationPlacement}
            />
          </td>
        </tr>
        <tr>
          <th>Radius</th>
          <td><input type="number" min="0" step="1" value={movement.radius ?? 0} onChange={(e) => onUpdateMovement(unitIndex, {radius: parseFloat(e.target.value) || 0})} /></td>
        </tr>
        <tr>
          <th>Speed</th>
          <td><input type="number" min="0.1" max="1" step="0.05" value={movement.speed ?? 0.3} onChange={(e) => onUpdateMovement(unitIndex, {speed: parseFloat(e.target.value) || 0})} /></td>
        </tr>
        <tr>
          <th>Wait Time</th>
          <td><input type="number" min="0" step="0.5" value={movement.waitTime ?? 1} onChange={(e) => onUpdateMovement(unitIndex, {waitTime: parseFloat(e.target.value) || 0})} /></td>
        </tr>
      </tbody>
    </table>
  );
}

export function MovementFields({unit, unitIndex, patrolStepPlacement, onStartPatrolStepPlacement, onStartPatrolStepEdit, onHoverPatrolStep, wanderLocationPlacement, onStartWanderLocationPlacement, onUpdateMovement}) {
  const type = unit.movement?.type ?? "still";
  if (type === "patrol") {
    return (
      <PatrolFields
        unit={unit} unitIndex={unitIndex}
        patrolStepPlacement={patrolStepPlacement} onStartPatrolStepPlacement={onStartPatrolStepPlacement} onStartPatrolStepEdit={onStartPatrolStepEdit}
        onHoverPatrolStep={onHoverPatrolStep}
        onUpdateMovement={onUpdateMovement}
      />
    );
  }
  if (type === "wander") {
    return (
      <WanderFields
        unit={unit} unitIndex={unitIndex}
        wanderLocationPlacement={wanderLocationPlacement} onStartWanderLocationPlacement={onStartWanderLocationPlacement}
        onUpdateMovement={onUpdateMovement}
      />
    );
  }
  return null;
}
