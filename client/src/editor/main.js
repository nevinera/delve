import "./editor.css";
import { Editor } from "./editor.js";
import { World } from "./world.js";
import { slug } from "./zones.js";

// Editor entry (plans/roadmap.md, "World editor").

const $ = (id) => document.getElementById(id);

const world = World.empty();
const editor = new Editor(world, {
  map: $("map"),
  cursor: $("cursor"),
  continent: $("continent"),
  zoneList: $("zoneList"),
  newZone: $("newZone"),
  zonePanel: $("zonePanel"),
  zoneName: $("zoneName"),
  regionInfo: $("regionInfo"),
  drawRegion: $("drawRegion"),
  deleteZone: $("deleteZone"),
  hint: $("hint"),
  message: $("message"),
});

$("download").addEventListener("click", () => {
  const blob = new Blob([world.toZip()], { type: "application/zip" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${slug(world.info.name) || "world"}.zip`;
  link.click();
  URL.revokeObjectURL(link.href);
  editor.markSaved();
});

$("worldName").textContent = world.info.name;
