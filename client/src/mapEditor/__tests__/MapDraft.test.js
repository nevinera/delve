import {describe, it, expect} from "vitest";
import {MapDraft} from "../MapDraft";

const base = {
  identifier: "gc1-entrance", name: "Gc1 Entrance", elvl: null,
  imageUrl: null, pixelDimensions: null, feetDimensions: null,
  barriers: [], connections: [], units: [],
};

describe("MapDraft", () => {
  describe("setField/addEntry/removeEntry/updateEntryField", () => {
    it("setField returns a new MapDraft with the field updated", () => {
      const draft = new MapDraft(base);
      const result = draft.setField("name", "New Name");
      expect(result).not.toBe(draft);
      expect(result.data.name).toBe("New Name");
      expect(draft.data.name).toBe("Gc1 Entrance");
    });

    it("addEntry appends to the named section", () => {
      const result = new MapDraft(base).addEntry("barriers", {type: "wall", locations: []});
      expect(result.data.barriers).toEqual([{type: "wall", locations: []}]);
    });

    it("removeEntry removes only the entry at the given index", () => {
      const draft = new MapDraft({...base, barriers: [{type: "wall"}, {type: "circle"}]});
      const result = draft.removeEntry("barriers", 0);
      expect(result.data.barriers).toEqual([{type: "circle"}]);
    });

    it("updateEntryField updates only the entry at the given index", () => {
      const draft = new MapDraft({...base, barriers: [{type: "wall", locations: [1]}, {type: "wall", locations: [2]}]});
      const result = draft.updateEntryField("barriers", 1, "locations", [9]);
      expect(result.data.barriers).toEqual([{type: "wall", locations: [1]}, {type: "wall", locations: [9]}]);
    });
  });

  describe("barriers", () => {
    it("addWall appends an empty wall", () => {
      const result = new MapDraft(base).addWall();
      expect(result.data.barriers).toEqual([{type: "wall", locations: []}]);
    });

    it("addCircle appends a circle with the given location/radius", () => {
      const result = new MapDraft(base).addCircle({x: 1, y: 2}, 5);
      expect(result.data.barriers).toEqual([{type: "circle", location: {x: 1, y: 2}, radius: 5}]);
    });

    it("removeBarrier removes only the entry at the given index", () => {
      const draft = new MapDraft({...base, barriers: [{type: "wall"}, {type: "circle"}]});
      expect(draft.removeBarrier(1).data.barriers).toEqual([{type: "wall"}]);
    });

    it("insertBarrierPoint splices a point in at pointIndex without disturbing the others", () => {
      const draft = new MapDraft({...base, barriers: [{type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}]}]});
      const result = draft.insertBarrierPoint(0, 1, {x: 5, y: 5});
      expect(result.data.barriers[0].locations).toEqual([{x: 0, y: 0}, {x: 5, y: 5}, {x: 10, y: 0}]);
    });

    it("setBarrierPoint replaces the point at pointIndex in place, keeping the count", () => {
      const draft = new MapDraft({...base, barriers: [{type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}]}]});
      const result = draft.setBarrierPoint(0, 1, {x: 99, y: 99});
      expect(result.data.barriers[0].locations).toEqual([{x: 0, y: 0}, {x: 99, y: 99}]);
    });
  });

  describe("connections", () => {
    it("removeConnection removes only the entry at the given index", () => {
      const draft = new MapDraft({...base, connections: [{identifier: "a"}, {identifier: "b"}]});
      expect(draft.removeConnection(0).data.connections).toEqual([{identifier: "b"}]);
    });

    it("setConnectionField on 'position' keeps the angle, replaces x/y", () => {
      const draft = new MapDraft({...base, connections: [{identifier: "a", type: "point", position: {x: 0, y: 0, angle: 90}}]});
      const result = draft.setConnectionField(0, "position", {x: 5, y: 5});
      expect(result.data.connections[0].position).toEqual({x: 5, y: 5, angle: 90});
    });

    it("setConnectionField on 'start'/'end' replaces the endpoint wholesale", () => {
      const draft = new MapDraft({...base, connections: [{identifier: "a", type: "line", start: {x: 0, y: 0}, end: {x: 10, y: 10}}]});
      const result = draft.setConnectionField(0, "start", {x: 1, y: 2});
      expect(result.data.connections[0].start).toEqual({x: 1, y: 2});
    });
  });

  describe("units", () => {
    const unit = {unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 45}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}};

    it("removeUnit removes only the entry at the given index", () => {
      const draft = new MapDraft({...base, units: [unit, {...unit, identifier: "b"}]});
      expect(draft.removeUnit(0).data.units).toEqual([{...unit, identifier: "b"}]);
    });

    it("setUnitPosition keeps the facing angle, replaces x/y", () => {
      const draft = new MapDraft({...base, units: [unit]});
      const result = draft.setUnitPosition(0, {x: 5, y: 5});
      expect(result.data.units[0].position).toEqual({x: 5, y: 5, angle: 45});
    });

    it("updateMovement merges fields onto the existing movement object", () => {
      const draft = new MapDraft({...base, units: [{...unit, movement: {type: "patrol", choose: "loop"}}]});
      const result = draft.updateMovement(0, {choose: "return"});
      expect(result.data.units[0].movement).toEqual({type: "patrol", choose: "return"});
    });

    it("updateMovement defaults to {type: still} when the unit has no movement yet", () => {
      const draft = new MapDraft({...base, units: [{...unit, movement: undefined}]});
      const result = draft.updateMovement(0, {type: "wander"});
      expect(result.data.units[0].movement).toEqual({type: "wander"});
    });

    describe("patrol steps", () => {
      const withSteps = {
        ...unit,
        movement: {type: "patrol", choose: "loop", steps: [{position: {x: 5, y: 5, angle: 0}, movementRate: 0.5, waitTime: 1}]},
      };

      it("insertPatrolStep splices a new step in at stepIndex", () => {
        const draft = new MapDraft({...base, units: [withSteps]});
        const result = draft.insertPatrolStep(0, 0, {x: 1, y: 1});
        expect(result.data.units[0].movement.steps).toEqual([
          {position: {x: 1, y: 1, angle: 0}, movementRate: 0.5, waitTime: 1},
          {position: {x: 5, y: 5, angle: 0}, movementRate: 0.5, waitTime: 1},
        ]);
      });

      it("setPatrolStep replaces only the position at stepIndex, keeping movementRate/waitTime", () => {
        const draft = new MapDraft({...base, units: [withSteps]});
        const result = draft.setPatrolStep(0, 0, {x: 9, y: 9});
        expect(result.data.units[0].movement.steps).toEqual([
          {position: {x: 9, y: 9, angle: 0}, movementRate: 0.5, waitTime: 1},
        ]);
      });
    });

    it("setWanderLocation sets the movement's location", () => {
      const draft = new MapDraft({...base, units: [{...unit, movement: {type: "wander", radius: 10}}]});
      const result = draft.setWanderLocation(0, {x: 3, y: 4});
      expect(result.data.units[0].movement).toEqual({type: "wander", radius: 10, location: {x: 3, y: 4}});
    });
  });

  describe("groups", () => {
    const units = [
      {identifier: "a", groupIdentifier: null},
      {identifier: "b", groupIdentifier: "raiders"},
    ];

    it("toggleGroupMember adds a non-member", () => {
      const result = new MapDraft({...base, units}).toggleGroupMember("raiders", 0);
      expect(result.data.units[0].groupIdentifier).toBe("raiders");
    });

    it("toggleGroupMember removes an existing member", () => {
      const result = new MapDraft({...base, units}).toggleGroupMember("raiders", 1);
      expect(result.data.units[1].groupIdentifier).toBeNull();
    });

    it("toggleGroupMember moves a unit out of a different group silently", () => {
      const draft = new MapDraft({...base, units: [{identifier: "a", groupIdentifier: "old"}]});
      const result = draft.toggleGroupMember("new", 0);
      expect(result.data.units[0].groupIdentifier).toBe("new");
    });

    it("renameGroup rewrites every current member's groupIdentifier", () => {
      const draft = new MapDraft({...base, units: [...units, {identifier: "c", groupIdentifier: "raiders"}]});
      const result = draft.renameGroup("raiders", "warband");
      expect(result.data.units.map((u) => u.groupIdentifier)).toEqual([null, "warband", "warband"]);
    });
  });

  describe("setPixelDimensions", () => {
    it("sets pixelDimensions", () => {
      const result = new MapDraft(base).setPixelDimensions({width: 800, height: 600});
      expect(result.data.pixelDimensions).toEqual({width: 800, height: 600});
    });
  });

  describe("NCU movement (section \"ncus\")", () => {
    const ncuDraft = () => new MapDraft({units: [], ncus: [{identifier: "grizzle", position: {x: 1, y: 1, angle: 90}, movement: {type: "patrol", choose: "loop", steps: []}}]});

    it("moves an NCU without touching units", () => {
      const next = ncuDraft().setUnitPosition(0, {x: 5, y: 6}, "ncus");
      expect(next.data.ncus[0].position).toEqual({x: 5, y: 6, angle: 90});
      expect(next.data.units).toEqual([]);
    });

    it("inserts and edits an NCU's patrol steps", () => {
      const inserted = ncuDraft().insertPatrolStep(0, 0, {x: 3, y: 4}, "ncus");
      expect(inserted.data.ncus[0].movement.steps[0].position).toEqual({x: 3, y: 4, angle: 0});
      const edited = inserted.setPatrolStep(0, 0, {x: 7, y: 8}, "ncus");
      expect(edited.data.ncus[0].movement.steps[0].position).toEqual({x: 7, y: 8, angle: 0});
    });

    it("sets an NCU's wander location", () => {
      const next = ncuDraft().setWanderLocation(0, {x: 2, y: 2}, "ncus");
      expect(next.data.ncus[0].movement.location).toEqual({x: 2, y: 2});
    });
  });
});
