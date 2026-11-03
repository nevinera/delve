import { strFromU8 } from "fflate";

// The choice of class a character makes on first entering a world. The game server says which
// classes there are, and the world's own files say what they're like.

// What to show for each class id: `file` gives a world file's bytes, or null. A class whose file
// can't be read still shows, by its id. Sorted by name.
export async function classChoices(ids, file) {
  const choices = await Promise.all(
    ids.map(async (id) => {
      const bytes = await file(`classes/${id}.json`).catch(() => null);
      let data = {};
      try {
        data = bytes ? JSON.parse(strFromU8(bytes)) : {};
      } catch {
        // Shown by its id.
      }
      return {
        id,
        name: data.name || id,
        description: data.description ?? "",
        color: data.colors?.major ?? null,
        resources: (data.resources ?? []).map((r) => r.name).filter(Boolean),
      };
    }),
  );
  return choices.sort((a, b) => a.name.localeCompare(b.name));
}

// Fills `box` with a button for each choice, and calls onPick with the id of the one chosen.
export function showClassPicker(box, choices, onPick) {
  box.replaceChildren();
  const title = document.createElement("h2");
  title.textContent = "Choose your class";
  const note = document.createElement("p");
  note.textContent = "You keep it for as long as you play this world.";
  box.append(title, note);
  for (const choice of choices) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.class = choice.id;
    if (choice.color) button.style.borderLeftColor = choice.color;
    const name = document.createElement("strong");
    name.textContent = choice.name;
    button.append(name);
    for (const text of [choice.description, choice.resources.join(", ")]) {
      if (!text) continue;
      const line = document.createElement("span");
      line.textContent = text;
      button.append(line);
    }
    button.addEventListener("click", () => {
      box.hidden = true;
      onPick(choice.id);
    });
    box.append(button);
  }
  box.hidden = false;
}
