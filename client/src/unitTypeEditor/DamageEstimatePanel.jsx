const PLAN_LABELS = {
  offense: "Offense gear",
  offenseWithDefense: "Offense + some defense",
  defense: "Defense gear",
};

function formatElevation(ee) {
  return ee === 0 ? "+0" : String(ee);
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a - b);
}

// Plans in the order the server returns them (offense, hybrid, defense).
function uniqueInOrder(values) {
  return [...new Set(values)];
}

function Cell({cell}) {
  if (!cell) return <td>-</td>;
  return (
    <td>
      {cell.dps.toFixed(1)} dps
      <div className="damage-estimate-ttd">{cell.ttdSeconds === null ? "no damage" : `${cell.ttdSeconds.toFixed(1)}s to kill`}</div>
    </td>
  );
}

// Explicit-click estimate (not live-updating - see issue #72): a matrix of
// the unit's simulated DPS against mocked gear kits (rows) at several
// relative elevations (columns). Deliberately uncolored and untagged until
// there are target numbers to judge it against.
export default function DamageEstimatePanel({estimate, estimating, error, onEstimate}) {
  const results = estimate?.results ?? [];
  const plans = uniqueInOrder(results.map((r) => r.gearingPlan));
  const elevations = uniqueSorted(results.map((r) => r.elevation));

  return (
    <div className="damage-estimate">
      <div className="damage-estimate-header">
        <button type="button" className="estimate-damage-button" onClick={onEstimate} disabled={estimating}>
          {estimating ? "Estimating…" : "Estimate damage"}
        </button>
        {error && <span className="damage-estimate-error">{error}</span>}
      </div>
      {results.length > 0 && (
        <table className="damage-estimate-table">
          <thead>
            <tr>
              <th>Target gear \ Relative elevation</th>
              {elevations.map((ee) => (
                <th key={ee} scope="col">{formatElevation(ee)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {plans.map((plan) => (
              <tr key={plan}>
                <th scope="row">{PLAN_LABELS[plan] ?? plan}</th>
                {elevations.map((ee) => (
                  <Cell key={ee} cell={results.find((r) => r.gearingPlan === plan && r.elevation === ee)} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
