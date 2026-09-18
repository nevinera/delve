import {describe, it, expect} from "vitest";
import {UiState} from "../UiState";

describe("UiState", () => {
  it("defaults to select tool, nothing armed, no selection/hover", () => {
    const state = new UiState();
    expect(state.tool).toBe("select");
    expect(state.nothingArmed).toBe(true);
    expect(state.placement).toBeNull();
    expect(state.expandedUnitIndices).toEqual(new Set());
    expect(state.pendingGroupNames).toEqual([]);
  });

  describe("with", () => {
    it("returns a new UiState with just the given fields overridden", () => {
      const state = new UiState();
      const result = state.with({selectedBarrierIndex: 2});
      expect(result).not.toBe(state);
      expect(result.selectedBarrierIndex).toBe(2);
      expect(result.tool).toBe("select");
    });
  });

  describe("mutual exclusion between placement modes", () => {
    it("startBarrierPlacement clears every other mode", () => {
      const state = new UiState({connectionPlacement: {connectionIndex: 0, field: "position"}, tool: "add-circle"});
      const result = state.startBarrierPlacement(1, 0);
      expect(result.placement).toEqual({barrierIndex: 1, pointIndex: 0, mode: "insert"});
      expect(result.connectionPlacement).toBeNull();
      expect(result.tool).toBe("select");
    });

    it("startBarrierPointEdit sets mode: edit", () => {
      const result = new UiState().startBarrierPointEdit(1, 2);
      expect(result.placement).toEqual({barrierIndex: 1, pointIndex: 2, mode: "edit"});
    });

    it("advanceBarrierPlacement increments pointIndex, keeping insert mode", () => {
      const state = new UiState().startBarrierPlacement(1, 0);
      const result = state.advanceBarrierPlacement();
      expect(result.placement).toEqual({barrierIndex: 1, pointIndex: 1, mode: "insert"});
    });

    it("startConnectionFieldPlacement clears an in-progress barrier placement", () => {
      const state = new UiState().startBarrierPlacement(1, 0);
      const result = state.startConnectionFieldPlacement(0, "start");
      expect(result.connectionPlacement).toEqual({connectionIndex: 0, field: "start"});
      expect(result.placement).toBeNull();
    });

    it("startUnitPlacement clears every other mode", () => {
      const state = new UiState().startBarrierPlacement(1, 0);
      const result = state.startUnitPlacement(3);
      expect(result.unitPlacement).toEqual({unitIndex: 3});
      expect(result.placement).toBeNull();
    });

    it("startPatrolStepPlacement/advancePatrolStepPlacement mirror the barrier-point pair", () => {
      const state = new UiState().startPatrolStepPlacement(0, 0);
      expect(state.patrolStepPlacement).toEqual({unitIndex: 0, stepIndex: 0, mode: "insert"});
      const advanced = state.advancePatrolStepPlacement();
      expect(advanced.patrolStepPlacement).toEqual({unitIndex: 0, stepIndex: 1, mode: "insert"});
    });

    it("startPatrolStepEdit sets mode: edit", () => {
      const result = new UiState().startPatrolStepEdit(0, 2);
      expect(result.patrolStepPlacement).toEqual({unitIndex: 0, stepIndex: 2, mode: "edit"});
    });

    it("startWanderLocationPlacement clears every other mode", () => {
      const state = new UiState().startTool("add-circle");
      const result = state.startWanderLocationPlacement(0);
      expect(result.wanderLocationPlacement).toEqual({unitIndex: 0});
      expect(result.tool).toBe("select");
    });

    it("startTool clears every placement mode", () => {
      const state = new UiState().startBarrierPlacement(1, 0);
      const result = state.startTool("add-circle");
      expect(result.tool).toBe("add-circle");
      expect(result.placement).toBeNull();
    });

    it("startAddUnit arms the add-unit tool and records the pending unit type", () => {
      const result = new UiState().startAddUnit("goblin-raider");
      expect(result.tool).toBe("add-unit");
      expect(result.pendingUnitType).toBe("goblin-raider");
    });
  });

  describe("clearing a single mode", () => {
    it("clearPlacement only clears placement", () => {
      const state = new UiState({tool: "select"}).startBarrierPlacement(1, 0);
      expect(state.clearPlacement().placement).toBeNull();
    });

    it("clearConnectionPlacement only clears connectionPlacement", () => {
      const state = new UiState().startConnectionFieldPlacement(0, "position");
      expect(state.clearConnectionPlacement().connectionPlacement).toBeNull();
    });

    it("clearUnitPlacement only clears unitPlacement", () => {
      const state = new UiState().startUnitPlacement(0);
      expect(state.clearUnitPlacement().unitPlacement).toBeNull();
    });

    it("clearPatrolStepPlacement only clears patrolStepPlacement", () => {
      const state = new UiState().startPatrolStepPlacement(0, 0);
      expect(state.clearPatrolStepPlacement().patrolStepPlacement).toBeNull();
    });

    it("clearWanderLocationPlacement only clears wanderLocationPlacement", () => {
      const state = new UiState().startWanderLocationPlacement(0);
      expect(state.clearWanderLocationPlacement().wanderLocationPlacement).toBeNull();
    });
  });

  describe("grouping mode", () => {
    it("startGroupingMode arms the given group", () => {
      const result = new UiState().startGroupingMode("raiders");
      expect(result.groupingMode).toEqual({groupIdentifier: "raiders"});
    });

    it("startGroupingMode with the currently-active group turns it back off", () => {
      const state = new UiState().startGroupingMode("raiders");
      const result = state.startGroupingMode("raiders");
      expect(result.groupingMode).toBeNull();
    });

    it("startGroupingMode with a different group switches to it", () => {
      const state = new UiState().startGroupingMode("raiders");
      const result = state.startGroupingMode("scouts");
      expect(result.groupingMode).toEqual({groupIdentifier: "scouts"});
    });

    it("startGroupingMode clears an in-progress placement", () => {
      const state = new UiState().startBarrierPlacement(1, 0);
      const result = state.startGroupingMode("raiders");
      expect(result.placement).toBeNull();
    });

    it("addPendingGroup adds a new trimmed name and enters grouping mode for it", () => {
      const result = new UiState().addPendingGroup("  raiders  ");
      expect(result.pendingGroupNames).toEqual(["raiders"]);
      expect(result.groupingMode).toEqual({groupIdentifier: "raiders"});
    });

    it("addPendingGroup is a no-op for a blank name", () => {
      const state = new UiState();
      expect(state.addPendingGroup("   ")).toBe(state);
    });

    it("addPendingGroup doesn't duplicate an already-pending name", () => {
      const state = new UiState({pendingGroupNames: ["raiders"]});
      const result = state.addPendingGroup("raiders");
      expect(result.pendingGroupNames).toEqual(["raiders"]);
    });

    it("renameGroup renames a pending name and an active groupingMode targeting it", () => {
      const state = new UiState({pendingGroupNames: ["raiders"], groupingMode: {groupIdentifier: "raiders"}});
      const result = state.renameGroup("raiders", "warband");
      expect(result.pendingGroupNames).toEqual(["warband"]);
      expect(result.groupingMode).toEqual({groupIdentifier: "warband"});
    });

    it("renameGroup leaves groupingMode alone if it's targeting a different group", () => {
      const state = new UiState({groupingMode: {groupIdentifier: "scouts"}});
      const result = state.renameGroup("raiders", "warband");
      expect(result.groupingMode).toEqual({groupIdentifier: "scouts"});
    });
  });

  describe("focusUnit", () => {
    it("selects the unit and sets a focus request with nonce 1 from a fresh state", () => {
      const result = new UiState().focusUnit(3);
      expect(result.selectedUnitIndex).toBe(3);
      expect(result.unitFocusRequest).toEqual({index: 3, nonce: 1});
    });

    it("bumps the nonce even when re-focusing the same unit", () => {
      const first = new UiState().focusUnit(3);
      const second = first.focusUnit(3);
      expect(second.unitFocusRequest).toEqual({index: 3, nonce: 2});
    });
  });
});
