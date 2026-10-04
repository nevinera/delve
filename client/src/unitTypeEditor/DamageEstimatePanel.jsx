import {unitTargets, targetFit, referenceTimeToKill, GEAR_PROFILES} from "../balanceTargets";

const PLAN_LABELS = {
  offense: "Offense gear (squishy)",
  offenseWithDefense: "Offense + some defense (tanky DPS)",
  defense: "Defense gear (tank)",
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

function formatRange([lo, hi], digits = 0, suffix = "") {
  const a = lo.toFixed(digits);
  const b = hi.toFixed(digits);
  return a === b ? `${a}${suffix}` : `${a}-${b}${suffix}`;
}

function Cell({cell, target}) {
  if (!cell) return <td>-</td>;
  const fit = target && cell.ttdSeconds !== null ? targetFit(cell.ttdSeconds, target) : null;
  return (
    <td className={fit ? `target-${fit}` : undefined}>
      {cell.dps.toFixed(1)} dps
      <div className="damage-estimate-ttd">{cell.ttdSeconds === null ? "no damage" : `${cell.ttdSeconds.toFixed(1)}s to kill`}</div>
      {target && <div className="damage-estimate-target">target {formatRange(target, 0, "s")}</div>}
    </td>
  );
}

// The unit's own maxHP/dps against the targets for its tags (see
// docs/combat_balance.md), or why there are none.
function TargetSummary({targets, maxHP, dps}) {
  if (targets.untargeted) {
    return <p className="damage-estimate-targets">No balance targets for {targets.untargeted} yet.</p>;
  }
  const hpFit = typeof maxHP === "number" ? targetFit(maxHP, targets.hp) : null;
  const dpsFit = typeof dps === "number" ? targetFit(dps, targets.dps) : null;
  return (
    <p className="damage-estimate-targets">
      Targets for {targets.intendedFor}, {targets.pull}:{" "}
      <span className={hpFit ? `target-${hpFit}` : undefined}>{formatRange(targets.hp)} HP (this unit: {maxHP ?? "-"})</span>,{" "}
      <span className={dpsFit ? `target-${dpsFit}` : undefined}>{formatRange(targets.dps, 1)} dps (this unit: {dps ?? "-"})</span>
    </p>
  );
}

const KILL_PLANS = ["offense", "offenseWithDefense", "defense"];
const KILL_ELEVATIONS = [0, -5, -10];

// How long the reference character (see balanceTargets.js) takes to kill this
// unit, per gear profile and elevation, against the target for its tags.
// Needs no estimate: it's the unit's maxHP over a fixed reference DPS.
function TimeToKill({targets, maxHP}) {
  if (targets.untargeted || typeof maxHP !== "number") return null;
  return (
    <table className="damage-estimate-table damage-estimate-kill-table">
      <caption>Time for the reference character to kill it</caption>
      <thead>
        <tr>
          <th>Character gear \ Relative elevation</th>
          {KILL_ELEVATIONS.map((ee) => (
            <th key={ee} scope="col">{formatElevation(ee)}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {KILL_PLANS.map((plan) => (
          <tr key={plan}>
            <th scope="row">{GEAR_PROFILES[plan].label}</th>
            {KILL_ELEVATIONS.map((ee) => {
              const seconds = referenceTimeToKill(maxHP, plan, ee);
              const target = targets.ttk(plan, ee);
              const fit = targetFit(seconds, target);
              return (
                <td key={ee} className={`target-${fit}`}>
                  {seconds.toFixed(1)}s
                  <div className="damage-estimate-target">target {formatRange(target, 0, "s")}</div>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Explicit-click estimate (not live-updating - see issue #72): a matrix of
// the unit's simulated DPS against mocked gear kits (rows) at several
// relative elevations (columns), each time-to-kill shown against its target
// for the unit's balance tags.
export default function DamageEstimatePanel({estimate, estimating, error, onEstimate, unitType = {}}) {
  const results = estimate?.results ?? [];
  const targets = unitTargets(unitType.tags);
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
      <TargetSummary targets={targets} maxHP={unitType.maxHP} dps={unitType.dps} />
      <TimeToKill targets={targets} maxHP={unitType.maxHP} />
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
                  <Cell key={ee} cell={results.find((r) => r.gearingPlan === plan && r.elevation === ee)} target={targets.ttd?.(plan, ee)} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
