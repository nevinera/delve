// Owns every "which mode/tool/selection is active" concern in the map
// editor - none of it is part of the saved map (see MapDraft.js), all of
// it is interaction state. Consolidates a rule that used to be repeated by
// hand in every "start*" function in MapEditor.jsx: at most one of
// {wall-point placement, connection-field placement, unit-position
// placement, a patrol-step/wander placement, an armed add-tool, grouping
// mode} is ever active - starting one cancels the others (see #clearModes).
//
// Immutable, like every other draft class: every mutator returns a new
// UiState rather than changing this one in place.
export class UiState {
  constructor(fields = {}) {
    this.tool = fields.tool ?? "select";
    // {barrierIndex, pointIndex, mode: "insert" | "edit"} | null
    this.placement = fields.placement ?? null;
    // {connectionIndex, field: "position" | "start" | "end"} | null
    this.connectionPlacement = fields.connectionPlacement ?? null;
    // {unitIndex, section} | null - re-placing an existing unit's (or, with
    // section "ncus", an NCU's) position
    this.unitPlacement = fields.unitPlacement ?? null;
    // {unitIndex, stepIndex, mode: "insert" | "edit", section} | null
    this.patrolStepPlacement = fields.patrolStepPlacement ?? null;
    // {unitIndex, section} | null - re-placing a wander zone's location
    this.wanderLocationPlacement = fields.wanderLocationPlacement ?? null;
    // The group open in the Units tab (its groupIdentifier) | null - while
    // open, shift-clicking a unit toggles its membership. Not a mode:
    // placements (a member's position, patrol steps) happen inside it.
    this.openGroup = fields.openGroup ?? null;

    this.selectedBarrierIndex = fields.selectedBarrierIndex ?? null;
    this.selectedConnectionIndex = fields.selectedConnectionIndex ?? null;
    this.selectedUnitIndex = fields.selectedUnitIndex ?? null;
    this.hoveredBarrierIndex = fields.hoveredBarrierIndex ?? null;
    this.hoveredPoint = fields.hoveredPoint ?? null; // {barrierIndex, pointIndex} | null
    this.hoveredConnectionIndex = fields.hoveredConnectionIndex ?? null;
    this.hoveredUnitIndex = fields.hoveredUnitIndex ?? null;
    this.hoveredPatrolStep = fields.hoveredPatrolStep ?? null; // {unitIndex, stepIndex} | null
    this.hoveredGroupIdentifier = fields.hoveredGroupIdentifier ?? null;
    // The unitType key armed for "add-unit" (see #startAddUnit).
    this.pendingUnitType = fields.pendingUnitType ?? null;
    // Which unit rows are open in UnitsPanel - mirrored up here (rather
    // than owned there) so MovementShapes can treat "being edited" the
    // same as hovered.
    this.expandedUnitIndices = fields.expandedUnitIndices ?? new Set();
    // {index, nonce} | null - clicking a unit's token on the map should
    // open only that unit's row and scroll it into view, even if it's
    // already the selected one (see #focusUnit's nonce bump).
    this.unitFocusRequest = fields.unitFocusRequest ?? null;
    // The unit type hovered in the Units tab's palette - its units are
    // highlighted on the map.
    this.hoveredUnitType = fields.hoveredUnitType ?? null;
    // "?" toggles this; Escape closes it.
    this.showHotkeyHelp = fields.showHotkeyHelp ?? false;
  }

  with(fields) {
    return new UiState({...this, ...fields});
  }

  get nothingArmed() {
    return this.tool === "select" && !this.placement && !this.connectionPlacement && !this.unitPlacement
      && !this.patrolStepPlacement && !this.wanderLocationPlacement;
  }

  // Clears every mutual-exclusion mode - the common first step of every
  // "start*" method below, and reused directly by Simulate Units/Walk
  // Preview mode entry (see MapEditor.jsx).
  clearModes() {
    return this.with({
      placement: null, connectionPlacement: null, unitPlacement: null,
      patrolStepPlacement: null, wanderLocationPlacement: null, tool: "select",
    });
  }

  startBarrierPlacement(barrierIndex, pointIndex, mode = "insert") {
    return this.clearModes().with({placement: {barrierIndex, pointIndex, mode}});
  }

  startBarrierPointEdit(barrierIndex, pointIndex) {
    return this.startBarrierPlacement(barrierIndex, pointIndex, "edit");
  }

  // "insert" mode auto-advances to the gap right after the point just
  // placed, so a run of clicks lays down consecutive points.
  advanceBarrierPlacement() {
    const {barrierIndex, pointIndex} = this.placement;
    return this.with({placement: {barrierIndex, pointIndex: pointIndex + 1, mode: "insert"}});
  }

  clearPlacement() {
    return this.with({placement: null});
  }

  startConnectionFieldPlacement(connectionIndex, field) {
    return this.clearModes().with({connectionPlacement: {connectionIndex, field}});
  }

  clearConnectionPlacement() {
    return this.with({connectionPlacement: null});
  }

  startUnitPlacement(unitIndex, section = "units") {
    return this.clearModes().with({unitPlacement: {unitIndex, section}});
  }

  clearUnitPlacement() {
    return this.with({unitPlacement: null});
  }

  // Mirrors #startBarrierPlacement/#advanceBarrierPlacement exactly, for a
  // patrol step's position.
  startPatrolStepPlacement(unitIndex, stepIndex, mode = "insert", section = "units") {
    return this.clearModes().with({patrolStepPlacement: {unitIndex, stepIndex, mode, section}});
  }

  startPatrolStepEdit(unitIndex, stepIndex, section = "units") {
    return this.startPatrolStepPlacement(unitIndex, stepIndex, "edit", section);
  }

  advancePatrolStepPlacement() {
    const {unitIndex, stepIndex, section} = this.patrolStepPlacement;
    return this.with({patrolStepPlacement: {unitIndex, stepIndex: stepIndex + 1, mode: "insert", section}});
  }

  clearPatrolStepPlacement() {
    return this.with({patrolStepPlacement: null});
  }

  startWanderLocationPlacement(unitIndex, section = "units") {
    return this.clearModes().with({wanderLocationPlacement: {unitIndex, section}});
  }

  clearWanderLocationPlacement() {
    return this.with({wanderLocationPlacement: null});
  }

  startTool(nextTool) {
    return this.clearModes().with({tool: nextTool});
  }

  startAddUnit(unitTypeKey) {
    return this.startTool("add-unit").with({pendingUnitType: unitTypeKey});
  }

  // The open group's side of a rename - MapDraft#renameGroup handles the
  // units themselves.
  renameGroup(oldName, newName) {
    return this.with({openGroup: this.openGroup === oldName ? newName : this.openGroup});
  }

  // Clicking a unit's token on the map (as opposed to its own row in
  // UnitsPanel) should open only that unit's row and scroll it into view,
  // even if it's already the selected one - the nonce bump is what lets a
  // dependent effect tell "same unit, clicked again" from "nothing happened".
  focusUnit(unitIndex) {
    const nonce = (this.unitFocusRequest?.nonce ?? 0) + 1;
    return this.with({selectedUnitIndex: unitIndex, unitFocusRequest: {index: unitIndex, nonce}});
  }
}
