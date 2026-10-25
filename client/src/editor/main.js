import "./editor.css";
import { MapView } from "./mapView.js";
import { World } from "./world.js";

// Editor entry (plans/roadmap.md, "World editor").

const $ = (id) => document.getElementById(id);

const world = World.empty();

new MapView($("map"), {
  onPointer: ([x, z]) => {
    $("cursor").textContent = `tile ${Math.floor(x)}, ${Math.floor(z)}`;
  },
});

$("download").addEventListener("click", () => {
  const blob = new Blob([world.toZip()], { type: "application/zip" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${slug(world.info.name) || "world"}.zip`;
  link.click();
  URL.revokeObjectURL(link.href);
});

$("worldName").textContent = world.info.name;

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
