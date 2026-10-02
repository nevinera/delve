import {useState} from "react";

function TextField({value, onChange, placeholder}) {
  return <input type="text" value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)} />;
}

function IntField({value, onChange}) {
  return (
    <input
      type="number" step="1" value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : parseInt(e.target.value, 10))}
    />
  );
}

// elevationRange is a single optional [min, max] array (see
// docs/schema/world.md) - clearing both sides omits the field entirely
// rather than saving a half-filled range.
function ElevationRangeField({value, onChange}) {
  const [min, max] = value ?? [null, null];

  function update(nextMin, nextMax) {
    if (nextMin === null && nextMax === null) {
      onChange(null);
    } else {
      onChange([nextMin, nextMax]);
    }
  }

  return (
    <div className="range-field">
      <IntField value={min} onChange={(v) => update(v, max)} />
      <span className="range-sep">to</span>
      <IntField value={max} onChange={(v) => update(min, v)} />
    </div>
  );
}

// Type a path, or upload an image - WorldEditor downscales it and points
// thumbnailUrl at a sibling <world>.thumb.webp, committed on save. The
// file input is remounted (via `resetKey`) after each upload, since its
// displayed filename can't otherwise be cleared programmatically.
function ThumbnailField({value, previewUrl, onChange, onUpload}) {
  const [resetKey, setResetKey] = useState(0);
  return (
    <div className="world-thumbnail-field">
      <TextField value={value} onChange={onChange} placeholder="northern-barrens.thumb.webp" />
      <input
        key={resetKey}
        type="file" accept="image/*" aria-label="Upload thumbnail"
        onChange={(e) => {
          const file = e.target.files[0];
          if (file) onUpload(file);
          setResetKey((k) => k + 1);
        }}
      />
      {previewUrl && <img className="world-thumbnail-preview" src={previewUrl} alt="Thumbnail preview" />}
    </div>
  );
}

// Top-level World fields only - zones/worldLinks/entryPoints each get their
// own panel below (see WorldEditor.jsx).
export default function WorldFieldsPanel({draft, onChange, thumbnailPreviewUrl, onUploadThumbnail}) {
  const {data} = draft;

  return (
    <table>
      <tbody>
        <tr>
          <th>Name</th>
          <td><TextField value={data.name} onChange={(v) => onChange(draft.setField("name", v))} placeholder="Northern Barrens" /></td>
        </tr>
        <tr>
          <th>Description</th>
          <td><TextField value={data.description} onChange={(v) => onChange(draft.setField("description", v))} /></td>
        </tr>
        <tr>
          <th>Thumbnail URL</th>
          <td>
            <ThumbnailField
              value={data.thumbnailUrl}
              previewUrl={thumbnailPreviewUrl}
              onChange={(v) => onChange(draft.setField("thumbnailUrl", v))}
              onUpload={onUploadThumbnail}
            />
          </td>
        </tr>
        <tr>
          <th>Elevation Range</th>
          <td><ElevationRangeField value={data.elevationRange} onChange={(v) => onChange(draft.setField("elevationRange", v))} /></td>
        </tr>
      </tbody>
    </table>
  );
}
