import * as THREE from "three";

// The "show line of sight" graphics option: a line to each other character within REACH_FT, green
// when you can see them, yellow when you can't, and red when this client and the game server
// disagree.

const REACH_FT = 150;
const ASK_S = 0.5; // how often it asks the server about each
const COLORS = { clear: new THREE.Color(0x40e060), blocked: new THREE.Color(0xf0d030), disagree: new THREE.Color(0xf03030) };
const CHEST_FT = 3.5;

// The line's color's name: `server` is undefined until it has answered.
export function sightColor(client, server) {
  if (server !== undefined && server !== client) return "disagree";
  return client ? "clear" : "blocked";
}

export class SightLines {
  // view: the PlayView; others: the Others; connection: the game connection.
  constructor(view, others, connection) {
    Object.assign(this, { view, others, connection });
    this.on = false;
    this.answers = new Map(); // id -> what the server last said
    this.sinceAsked = ASK_S;
    this.lines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true }));
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 10;
    this.lines.visible = false;
  }

  // Adds the checkbox to the graphics panel.
  addOption(root) {
    const label = document.createElement("label");
    label.className = "play-check";
    label.title = "Green: you can see them. Yellow: you can't. Red: this client and the game server disagree.";
    label.innerHTML = '<input type="checkbox"><span>show line of sight</span>';
    const box = label.querySelector("input");
    box.addEventListener("change", () => {
      box.blur();
      this.show(box.checked);
    });
    root.append(label);
  }

  show(on) {
    this.on = on;
    this.lines.visible = on;
    if (on) this.view.scene.add(this.lines);
    else {
      this.lines.removeFromParent();
      this.answers.clear();
    }
  }

  answer({ target, clear }) {
    if (this.on) this.answers.set(target, clear);
  }

  frame(dt) {
    if (!this.on) return;
    const pos = this.view.walker?.pos;
    const ground = this.view.walkGround;
    if (!pos || !ground) return;
    const near = [...this.others.characters.values()].filter(({ shown }) => Math.hypot(shown.x - pos.x, shown.z - pos.z) <= REACH_FT);
    this.sinceAsked += dt;
    if (this.sinceAsked >= ASK_S) {
      this.sinceAsked = 0;
      for (const { id } of near) this.connection.askSees(id);
    }
    const points = [];
    const colors = [];
    for (const { id, shown } of near) {
      const client = ground.sees([pos.x, pos.y, pos.z], [shown.x, shown.y, shown.z]);
      const color = COLORS[sightColor(client, this.answers.get(id))];
      points.push(pos.x, pos.y + 5, pos.z, shown.x, shown.y + CHEST_FT, shown.z);
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
    }
    const geometry = this.lines.geometry;
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  }
}
