package combat

import "slices"

// The controls that take your character away from you, each with what it says when you try something.
var helpless = map[string]string{
	"stun":         "you're stunned",
	"incapacitate": "you're incapacitated",
	"disorient":    "you're disoriented",
	"fear":         "you're afraid",
}

// Controls is the controls a status puts on its holder, in the order it lists them.
func (s *Status) Controls() []string {
	var out []string
	for i := range s.Effects {
		if e := &s.Effects[i]; e.Type == "control" && e.Control != "" {
			out = append(out, e.Control)
		}
	}
	return out
}

// BreaksOnDamage says whether taking damage ends a status: one that says so, or one holding its
// holder with a control that damage breaks.
func (s *Status) BreaksOnDamage() bool {
	if slices.Contains(s.BreaksOn, "damage") {
		return true
	}
	return slices.ContainsFunc(s.Controls(), func(c string) bool { return c == "incapacitate" || c == "disorient" || c == "fear" })
}

// Blocked says why controls stop you using an ability, or "" if they don't. Silence stops everything
// but physical abilities, and disarm stops physical ones in melee.
func Blocked(controls []string, a *Ability) string {
	for _, c := range controls {
		if why := helpless[c]; why != "" {
			return why
		}
	}
	physical := a.School == "" && len(a.Schools) == 0 || a.School == "physical" || slices.Equal(a.Schools, []string{"physical"})
	if slices.Contains(controls, "silence") && !physical {
		return "you're silenced"
	}
	if slices.Contains(controls, "disarm") && physical && a.Range.Melee {
		return "you're disarmed"
	}
	return ""
}

// CanSwing says whether controls leave a unit able to auto-attack.
func CanSwing(controls []string) bool {
	return !slices.ContainsFunc(controls, func(c string) bool { return helpless[c] != "" || c == "disarm" })
}

// HoldsStill says whether controls stop a unit moving.
func HoldsStill(controls []string) bool {
	return slices.ContainsFunc(controls, func(c string) bool { return helpless[c] != "" || c == "root" })
}

// Helpless says whether controls have taken a unit's character away from it.
func Helpless(controls []string) bool {
	return slices.ContainsFunc(controls, func(c string) bool { return helpless[c] != "" })
}
