import {describe, it, expect} from "vitest";
import {connectionStatus, connectionKey} from "../connectionStatus";

describe("connectionKey", () => {
  it("joins a map identifier and connection identifier with a slash", () => {
    expect(connectionKey("cave_entrance", "cave_mouth")).toBe("cave_entrance/cave_mouth");
  });
});

describe("connectionStatus", () => {
  it("reports open when the connection appears in none of zoneLinks/entryPoints/openConnections", () => {
    const status = connectionStatus("cave_entrance", "cave_mouth", {zoneLinks: [], entryPoints: {}, openConnections: {}});
    expect(status).toEqual({type: "open", key: "cave_entrance/cave_mouth"});
  });

  it("reports entryPoint, including a null required key", () => {
    const status = connectionStatus("cave_entrance", "cave_mouth", {
      zoneLinks: [], entryPoints: {"cave_entrance/cave_mouth": null}, openConnections: {},
    });
    expect(status).toEqual({type: "entryPoint", key: "cave_entrance/cave_mouth", requiredKey: null});
  });

  it("reports entryPoint with a required key string", () => {
    const status = connectionStatus("cave_entrance", "cave_mouth", {
      zoneLinks: [], entryPoints: {"cave_entrance/cave_mouth": "iron_key"}, openConnections: {},
    });
    expect(status.requiredKey).toBe("iron_key");
  });

  it("reports openConnection with its exposed name", () => {
    const status = connectionStatus("cave_entrance", "back_door", {
      zoneLinks: [], entryPoints: {}, openConnections: {"cave_entrance/back_door": "back_way"},
    });
    expect(status).toEqual({type: "openConnection", key: "cave_entrance/back_door", name: "back_way"});
  });

  it("reports zoneLink from connectionA's side, with connectionB as the other side", () => {
    const zoneLinks = [{connectionA: {map: "cave_entrance", connection: "cave_mouth"}, connectionB: {map: "cave_interior", connection: "entrance"}, oneWay: false, requiredKey: null}];
    const status = connectionStatus("cave_entrance", "cave_mouth", {zoneLinks, entryPoints: {}, openConnections: {}});
    expect(status).toEqual({type: "zoneLink", linkIndex: 0, otherSide: {map: "cave_interior", connection: "entrance"}, oneWay: false, requiredKey: null});
  });

  it("reports zoneLink from connectionB's side, with connectionA as the other side", () => {
    const zoneLinks = [{connectionA: {map: "cave_entrance", connection: "cave_mouth"}, connectionB: {map: "cave_interior", connection: "entrance"}, oneWay: true, requiredKey: "iron_key"}];
    const status = connectionStatus("cave_interior", "entrance", {zoneLinks, entryPoints: {}, openConnections: {}});
    expect(status).toEqual({type: "zoneLink", linkIndex: 0, otherSide: {map: "cave_entrance", connection: "cave_mouth"}, oneWay: true, requiredKey: "iron_key"});
  });

  it("zoneLink takes precedence when a connection somehow also appears in entryPoints", () => {
    const zoneLinks = [{connectionA: {map: "cave_entrance", connection: "cave_mouth"}, connectionB: {map: "cave_interior", connection: "entrance"}}];
    const status = connectionStatus("cave_entrance", "cave_mouth", {
      zoneLinks, entryPoints: {"cave_entrance/cave_mouth": null}, openConnections: {},
    });
    expect(status.type).toBe("zoneLink");
  });
});
