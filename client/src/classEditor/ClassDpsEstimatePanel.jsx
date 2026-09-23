const DURATION_LABELS = {60: "1m", 300: "5m", 1200: "20m"};

function formatDuration(seconds) {
  return DURATION_LABELS[seconds] ?? `${seconds}s`;
}

// Elevations in the order the server always returns them (trainee, dungeon,
// heroic, raid) - see classdps.Elevations.
const ELEVATION_ORDER = ["trainee", "dungeon", "heroic", "raid"];

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a - b);
}

function emptyEntry() {
  return {power: "", condition: null};
}

// One priority-list row: which power to try, and an optional
// missingStatus/hasStatus gate (see classdps.StrategyCondition) - "if
// Moonfire isn't up, cast Moonfire" is condition: {type: "missingStatus",
// on: "target", status: "Moonfire"}.
function StrategyRow({entry, index, total, powerNames, onChange, onRemove, onMove}) {
  function updatePower(power) {
    onChange(index, {...entry, power});
  }

  function updateConditionType(type) {
    if (!type) {
      onChange(index, {...entry, condition: null});
      return;
    }
    onChange(index, {...entry, condition: {type, on: entry.condition?.on ?? "target", status: entry.condition?.status ?? ""}});
  }

  function updateConditionField(field, value) {
    onChange(index, {...entry, condition: {...entry.condition, [field]: value}});
  }

  return (
    <tr className="strategy-row">
      <td>{index + 1}</td>
      <td>
        <select value={entry.power} onChange={(e) => updatePower(e.target.value)}>
          <option value="">(choose a power)</option>
          {powerNames.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </td>
      <td>
        <select value={entry.condition?.type ?? ""} onChange={(e) => updateConditionType(e.target.value)}>
          <option value="">always</option>
          <option value="missingStatus">if missing status</option>
          <option value="hasStatus">if has status</option>
        </select>
      </td>
      {entry.condition && (
        <>
          <td>
            <select value={entry.condition.on} onChange={(e) => updateConditionField("on", e.target.value)}>
              <option value="target">target</option>
              <option value="self">self</option>
            </select>
          </td>
          <td>
            <input
              type="text"
              value={entry.condition.status}
              placeholder="status name"
              onChange={(e) => updateConditionField("status", e.target.value)}
            />
          </td>
        </>
      )}
      {!entry.condition && <td colSpan={2} />}
      <td>
        <button type="button" onClick={() => onMove(index, -1)} disabled={index === 0}>↑</button>
        <button type="button" onClick={() => onMove(index, 1)} disabled={index === total - 1}>↓</button>
        <button type="button" onClick={() => onRemove(index)}>Remove</button>
      </td>
    </tr>
  );
}

function StrategyEditor({strategy, powerNames, onChange}) {
  function updateEntry(index, nextEntry) {
    onChange(strategy.map((e, i) => (i === index ? nextEntry : e)));
  }

  function removeEntry(index) {
    onChange(strategy.filter((_, i) => i !== index));
  }

  function moveEntry(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= strategy.length) return;
    const next = [...strategy];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function addEntry() {
    onChange([...strategy, emptyEntry()]);
  }

  return (
    <div className="strategy-editor">
      <table className="strategy-editor-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Power</th>
            <th>Condition</th>
            <th colSpan={2}>Condition detail</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {strategy.map((entry, i) => (
            <StrategyRow
              key={i}
              entry={entry}
              index={i}
              total={strategy.length}
              powerNames={powerNames}
              onChange={updateEntry}
              onRemove={removeEntry}
              onMove={moveEntry}
            />
          ))}
        </tbody>
      </table>
      <button type="button" className="strategy-editor-add" onClick={addEntry}>+ Add power</button>
    </div>
  );
}

function Cell({cell}) {
  if (!cell) return <td>-</td>;
  return <td>{cell.dps.toFixed(1)} dps</td>;
}

// Explicit-click estimate (not live-updating - same UX as
// DamageEstimatePanel/#72), plus the strategy editor a class needs that an
// enemy UnitType doesn't: a CharacterClass has no Tactics to drive its own
// power selection, so the caller supplies a priority-list rotation here.
// Rows are relative elevation (trainee/dungeon/heroic/raid), columns are
// fight duration (1m/5m/20m - see plans/character-dps-sim.md's decision to
// always show all three rather than take a caller-chosen duration).
export default function ClassDpsEstimatePanel({strategy, onStrategyChange, powerNames, estimate, estimating, error, onEstimate}) {
  const results = estimate?.results ?? [];
  const durations = uniqueSorted(results.map((r) => r.durationSeconds));
  const labelsSeen = new Set(results.map((r) => r.elevationLabel));
  const elevationLabels = ELEVATION_ORDER.filter((label) => labelsSeen.has(label));

  return (
    <div className="class-dps-estimate">
      <StrategyEditor strategy={strategy} powerNames={powerNames} onChange={onStrategyChange} />
      <div className="class-dps-estimate-header">
        <button type="button" className="estimate-dps-button" onClick={onEstimate} disabled={estimating}>
          {estimating ? "Estimating…" : "Estimate DPS"}
        </button>
        {error && <span className="class-dps-estimate-error">{error}</span>}
      </div>
      {results.length > 0 && (
        <table className="class-dps-estimate-table">
          <thead>
            <tr>
              <th>Elevation \ Duration</th>
              {durations.map((d) => (
                <th key={d} scope="col">{formatDuration(d)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {elevationLabels.map((label) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                {durations.map((d) => (
                  <Cell key={d} cell={results.find((r) => r.elevationLabel === label && r.durationSeconds === d)} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
