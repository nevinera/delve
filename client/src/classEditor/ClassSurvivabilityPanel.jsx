import {useState} from "react";
import {classSurvivalTarget, classSurvivalFit} from "../balanceTargets";

const AUDIENCES = ["open", "g1"];
const SCHOOLS = ["physical", "magic"];
const PULLS = ["solo", "pair", "group", "swarm"];

function formatElevation(ee) {
  return ee > 0 ? `+${ee}` : ee === 0 ? "+0" : String(ee);
}

function formatSeconds(seconds) {
  return `${seconds.toFixed(1)}s`;
}

function Select({label, value, options, onChange}) {
  return (
    <label className="class-survivability-select">
      {label}{" "}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function ttdText(cell) {
  return cell.survives ? `survives ${cell.capSeconds}s+` : formatSeconds(cell.ttd);
}

function hpLostText(cell) {
  return cell.died ? "dies" : `${Math.round(cell.hpLostPct)}%`;
}

function Row({cell}) {
  const target = classSurvivalTarget({...cell, ee: cell.elevation});
  const fit = classSurvivalFit(cell, target);
  return (
    <tr>
      <th scope="row">{formatElevation(cell.elevation)}</th>
      <td className={fit.ttd ? `target-${fit.ttd}` : undefined}>
        {ttdText(cell)}
        {target && <div className="class-dps-estimate-target">target {formatSeconds(target.ttd)}</div>}
      </td>
      <td className={fit.hpLost ? `target-${fit.hpLost}` : undefined}>
        {hpLostText(cell)}
        {target && <div className="class-dps-estimate-target">target {Math.round(target.hpLost * 100)}%</div>}
      </td>
    </tr>
  );
}

function PriorityTable({priority, cells}) {
  return (
    <>
      <h4 className="class-dps-estimate-priority">{priority} gear</h4>
      <table className="class-survivability-table">
        <thead>
          <tr>
            <th scope="col">Elevation</th>
            <th scope="col">Time to die</th>
            <th scope="col">HP lost</th>
          </tr>
        </thead>
        <tbody>
          {cells.map((cell) => (
            <Row key={cell.elevation} cell={cell} />
          ))}
        </tbody>
      </table>
    </>
  );
}

// Explicit-click survivability estimate (same UX as ClassDpsEstimatePanel,
// reusing its strategy): how long each stat priority's gear lasts against a
// reference pull that never dies (time to die), and what share of its health
// it loses killing the pull (HP lost), at each elevation, next to the
// targets from docs/combat_balance.md. The server returns every pull
// combination; the selectors pick which one to show.
export default function ClassSurvivabilityPanel({estimate, estimating, error, onEstimate}) {
  const [intendedFor, setIntendedFor] = useState("open");
  const [school, setSchool] = useState("physical");
  const [pull, setPull] = useState("solo");

  const results = (estimate?.results ?? []).filter((r) => r.intendedFor === intendedFor && r.school === school && r.pull === pull);
  const priorities = [...new Set(results.map((r) => r.priority))];

  return (
    <div className="class-survivability">
      <div className="class-survivability-header">
        <button type="button" className="estimate-survivability-button" onClick={onEstimate} disabled={estimating}>
          {estimating ? "Estimating…" : "Estimate survivability"}
        </button>
        {error && <span className="class-dps-estimate-error">{error}</span>}
      </div>
      {estimate && (
        <div className="class-survivability-selectors">
          <Select label="Content" value={intendedFor} options={AUDIENCES} onChange={setIntendedFor} />
          <Select label="Damage" value={school} options={SCHOOLS} onChange={setSchool} />
          <Select label="Pull" value={pull} options={PULLS} onChange={setPull} />
        </div>
      )}
      {priorities.map((priority) => (
        <PriorityTable
          key={priority}
          priority={priority}
          cells={results.filter((r) => r.priority === priority).sort((a, b) => b.elevation - a.elevation)}
        />
      ))}
    </div>
  );
}
