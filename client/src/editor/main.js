import "./editor.css";
import { updateIndexes } from "./continentIndex.js";
import { Editor } from "./editor.js";
import { World } from "./world.js";
import { slug } from "./zones.js";

// Editor entry (plans/roadmap.md, "World editor").

const $ = (id) => document.getElementById(id);

const editor = new Editor(World.empty(), {
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
  tools: $("tools"),
  generate: $("generate"),
  highlight: $("highlight"),
  pendingInfo: $("pendingInfo"),
  props: $("props"),
  hint: $("hint"),
  message: $("message"),
});

$("download").addEventListener("click", () => {
  updateIndexes(editor.world);
  const blob = new Blob([editor.world.toZip()], { type: "application/zip" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${slug(editor.world.info.name) || "world"}.zip`;
  link.click();
  URL.revokeObjectURL(link.href);
  editor.markSaved();
});

$("upload").addEventListener("click", () => {
  if (editor.dirty && !window.confirm("Replace this world? Changes you haven't downloaded will be lost.")) return;
  $("uploadFile").click();
});

$("uploadFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    editor.setWorld(World.fromZip(new Uint8Array(await file.arrayBuffer())));
    $("worldName").textContent = editor.world.info.name;
  } catch (err) {
    window.alert(`Couldn't load ${file.name}: ${err.message}`);
  }
});

$("worldName").textContent = editor.world.info.name;
