// What controls stop you doing, by the same rules as the game server (combat/controls.go), and
// tested against the same data.

const HELPLESS = { stun: "you're stunned", incapacitate: "you're incapacitated", disorient: "you're disoriented", fear: "you're afraid" };

// Why controls stop you using an ability, or "" if they don't.
export function blockedBy(controls, ability) {
  for (const control of controls) {
    if (HELPLESS[control]) return HELPLESS[control];
  }
  const schools = ability.schools ?? (ability.school ? [ability.school] : []);
  const physical = !schools.length || (schools.length === 1 && schools[0] === "physical");
  if (controls.includes("silence") && !physical) return "you're silenced";
  if (controls.includes("disarm") && physical && ability.range === "melee") return "you're disarmed";
  return "";
}

export const canSwing = (controls) => !controls.some((control) => HELPLESS[control] || control === "disarm");
export const holdsStill = (controls) => controls.some((control) => HELPLESS[control] || control === "root");
export const isHelpless = (controls) => controls.some((control) => HELPLESS[control]);
