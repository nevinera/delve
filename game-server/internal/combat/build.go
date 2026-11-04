package combat

import (
	"slices"
	"sort"
	"strconv"
)

// SpecLevel is when a character picks a specialization.
const SpecLevel = 10

// Build is what a character chose: its specialization and a talent for each tier, by the tier's level.
type Build struct {
	Specialization string            `json:"specialization"`
	Talents        map[string]string `json:"talents"`
}

// granted says what a talent gives someone of this specialization.
func granted(t *Talent, spec string) []TalentGrant {
	var out []TalentGrant
	for _, g := range t.Grants {
		if g.Spec == "" || g.Spec == spec {
			out = append(out, g)
		}
	}
	return out
}

// tiers is a class's talent tiers, lowest first.
func (c *Class) tiers() []string {
	out := make([]string, 0, len(c.Talents))
	for tier := range c.Talents {
		out = append(out, tier)
	}
	sort.Slice(out, func(i, j int) bool {
		a, _ := strconv.Atoi(out[i])
		b, _ := strconv.Atoi(out[j])
		return a < b
	})
	return out
}

// Allowed is a build with what a character of this level can't have left out. The client has the
// same rule (play/build.js), and testdata/build.json checks both.
func (c *Class) Allowed(b Build, level int) Build {
	out := Build{Talents: map[string]string{}}
	if level >= SpecLevel && slices.ContainsFunc(c.Specializations, func(s Specialization) bool { return s.ID == b.Specialization }) {
		out.Specialization = b.Specialization
	}
	above := ""
	for _, tier := range c.tiers() {
		at, _ := strconv.Atoi(tier)
		picked := ""
		if at <= level {
			for i := range c.Talents[tier] {
				t := &c.Talents[tier][i]
				if b.Talents[tier] != "" && t.ID == b.Talents[tier] && len(granted(t, out.Specialization)) > 0 && (t.Requires == "" || t.Requires == above) {
					picked = t.ID
				}
			}
		}
		if picked != "" {
			out.Talents[tier] = picked
		}
		above = picked
	}
	return out
}

// talentGrants is everything an allowed build's talents give it.
func (c *Class) talentGrants(b Build) []TalentGrant {
	var out []TalentGrant
	for _, tier := range c.tiers() {
		for i := range c.Talents[tier] {
			if t := &c.Talents[tier][i]; b.Talents[tier] != "" && t.ID == b.Talents[tier] {
				out = append(out, granted(t, b.Specialization)...)
			}
		}
	}
	return out
}
