import {useState} from "react";
import {composeSheet, loadFileImage, packImages} from "./packSheet";

const LICENSES = ["CC0-1.0", "CC-BY-4.0", "CC-BY-SA-4.0", "MIT"];
const KEY_FORMAT = /^[a-z0-9][a-z0-9_-]*$/;

const slug = (text) => text.toLowerCase().replace(/\.[^.]*$/, "").replace(/[^a-z0-9_-]+/g, "-").replace(/^[-_]+|[-_]+$/g, "") || "stamp";
const sizeOf = (image) => ({width: image.naturalWidth || image.width, height: image.naturalHeight || image.height});

function uniqueKey(base, taken) {
  let key = base;
  for (let n = 2; taken.has(key); n++) key = `${base}-${n}`;
  return key;
}

// Makes a stamp set from picked image files, or adds stamps to one of the
// zone's: the images are packed onto a sprite sheet here in the browser (an
// existing sheet grows downward, so placed stamps are unaffected). Each file
// becomes its own stamp, or all the files are variants of one stamp.
// sets/sheets are the zone's (see useStampsTab); onBuild({setKey, name,
// license, attribution, stamps, sheet}) receives the result.
export default function StampSetBuilder({sets, sheets, onBuild, onCancel}) {
  const existingKeys = Object.keys(sets);
  const [target, setTarget] = useState("");
  const [newKey, setNewKey] = useState("");
  const [name, setName] = useState("");
  const [license, setLicense] = useState("");
  const [attribution, setAttribution] = useState("");
  const [mode, setMode] = useState("each");
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const adding = target !== "";

  async function pick(e) {
    const files = [...e.target.files];
    e.target.value = "";
    setError(null);
    try {
      const images = await Promise.all(files.map(async (file) => ({file, image: await loadFileImage(file)})));
      const taken = new Set(adding ? Object.keys(sets[target].stamps ?? {}) : []);
      items.forEach((item) => taken.add(item.key));
      const made = mode === "variants"
        ? [{key: uniqueKey(slug(files[0].name), taken), name: "", feetWidth: 4, images}]
        : images.map((entry) => {
          const key = uniqueKey(slug(entry.file.name), taken);
          taken.add(key);
          return {key, name: "", feetWidth: 4, images: [entry]};
        });
      setItems((current) => [...current, ...made]);
    } catch (err) {
      setError(err.message);
    }
  }

  const update = (index, fields) => setItems((current) => current.map((item, i) => (i === index ? {...item, ...fields} : item)));

  function problem() {
    if (items.length === 0) return "Pick some images";
    if (adding && !sheets[target]) return "That set's sheet hasn't loaded yet";
    if (!adding) {
      if (!KEY_FORMAT.test(newKey)) return "The set's key is lowercase letters, digits, - and _";
      if (existingKeys.includes(newKey)) return `This zone already has a set ${newKey}`;
      if (!LICENSES.includes(license)) return "Pick a license";
      if (license.startsWith("CC-BY") && !attribution.trim()) return `${license} needs an attribution`;
      if (attribution.length > 400) return "Attribution is at most 400 characters";
    }
    const keys = items.map((item) => item.key);
    if (keys.some((key) => !KEY_FORMAT.test(key))) return "Stamp keys are lowercase letters, digits, - and _";
    if (new Set(keys).size !== keys.length) return "Two stamps share a key";
    if (items.some((item) => !(item.feetWidth > 0))) return "Each stamp needs a width in feet";
    return null;
  }

  async function submit() {
    const message = problem();
    if (message) return setError(message);
    setBusy(true);
    setError(null);
    try {
      const base = adding ? sheets[target] : null;
      const baseSize = base ? sizeOf(base) : {width: 0, height: 0};
      const flat = items.flatMap((item) => item.images);
      const packed = packImages(flat.map((entry) => sizeOf(entry.image)), {startY: baseSize.height, minWidth: baseSize.width});
      const sheet = await composeSheet({
        base, width: packed.width, height: packed.height,
        items: flat.map((entry, i) => ({image: entry.image, ...packed.placements[i]})),
      });
      let n = 0;
      const stamps = Object.fromEntries(items.map((item) => [item.key, {
        ...(item.name.trim() ? {name: item.name.trim()} : {}),
        feetWidth: Number(item.feetWidth),
        frames: item.images.map((entry) => ({...packed.placements[n++], ...sizeOf(entry.image)})),
      }]));
      onBuild({setKey: adding ? target : newKey, name: name.trim(), license, attribution, stamps, sheet});
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="stamp-set-builder">
      <label>
        Set
        <select aria-label="Set" value={target} onChange={(e) => { setTarget(e.target.value); setItems([]); }}>
          <option value="">New set</option>
          {existingKeys.map((key) => <option key={key} value={key}>{sets[key].name || key}</option>)}
        </select>
      </label>
      {!adding && (
        <>
          <label>Key <input aria-label="Set key" value={newKey} placeholder="camp" onChange={(e) => setNewKey(e.target.value)} /></label>
          <label>Name <input aria-label="Set name" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label>
            License
            <select aria-label="License" value={license} onChange={(e) => setLicense(e.target.value)}>
              <option value="">(pick one)</option>
              {LICENSES.map((id) => <option key={id} value={id}>{id}</option>)}
            </select>
          </label>
          <label>
            Attribution{license.startsWith("CC-BY") ? " (required)" : ""}
            <textarea aria-label="Attribution" rows={2} maxLength={400} value={attribution} onChange={(e) => setAttribution(e.target.value)} />
          </label>
        </>
      )}
      <div className="stamp-set-mode">
        <label><input type="radio" name="stamp-mode" checked={mode === "each"} onChange={() => setMode("each")} /> Each file is a stamp</label>
        <label><input type="radio" name="stamp-mode" checked={mode === "variants"} onChange={() => setMode("variants")} /> Files are variants of one stamp</label>
      </div>
      <label className="add-entry">
        Pick images…
        <input type="file" accept="image/*" multiple hidden aria-label="Pick images" onChange={pick} />
      </label>
      {items.map((item, index) => (
        <div key={item.key} className="stamp-set-item">
          <span>{item.images.length > 1 ? `${item.images.length} variants` : item.images[0].file.name}</span>
          <input aria-label={`Key ${index + 1}`} value={item.key} onChange={(e) => update(index, {key: e.target.value})} />
          <input aria-label={`Name ${index + 1}`} value={item.name} placeholder="Name" onChange={(e) => update(index, {name: e.target.value})} />
          <input aria-label={`Feet wide ${index + 1}`} type="number" min="0.5" step="0.5" value={item.feetWidth} onChange={(e) => update(index, {feetWidth: e.target.value})} />
          ft
          <button type="button" aria-label={`Remove ${index + 1}`} onClick={() => setItems((current) => current.filter((_, i) => i !== index))}>×</button>
        </div>
      ))}
      {error && <p className="zone-list-error">{error}</p>}
      <div className="add-buttons-row">
        <button type="button" disabled={busy} onClick={submit}>{adding ? "Add to set" : "Make set"}</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
