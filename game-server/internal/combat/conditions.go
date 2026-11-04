package combat

// Conditions: what an ability's `requires` and an effect's `when` ask of the fight. The client reads
// them too, in client/src/play/conditions.js, and both run testdata/conditions.json.

// Condition is one condition. Those this doesn't read yet hold.
type Condition struct {
	Health   string      `json:"health"`
	Below    *float64    `json:"below"`
	Above    *float64    `json:"above"`
	Status   string      `json:"status"`
	On       string      `json:"on"`
	Stacks   int         `json:"stacks"`
	Not      *Condition  `json:"not"`
	AnyOf    []Condition `json:"anyOf"`
	TargetIs string      `json:"targetIs"`
	State    string      `json:"state"`
	InCombat *bool       `json:"inCombat"`
	Position string      `json:"position"`
	Since    string      `json:"since"`
	Resource string      `json:"resource"`
	Percent  bool        `json:"percent"`
	Wielding string      `json:"wielding"`

	// About the fight so far, which only the server knows.
	Holders               string   `json:"holders"`
	AtLeast               *float64 `json:"atLeast"`
	AtMost                *float64 `json:"atMost"`
	UnitsOut              []string `json:"unitsOut"`
	InArea                string   `json:"inArea"`
	SpentAtLeast          *float64 `json:"spentAtLeast"`
	TargetsHitAtLeast     *int     `json:"targetsHitAtLeast"`
	Outcome               string   `json:"outcome"`
	TargetHealthBelowMine bool     `json:"targetHealthBelowMine"`
	Group                 string   `json:"group"`
}

// Unit is what conditions ask about someone.
type Unit struct {
	Health    float64        `json:"health"`
	MaxHealth float64        `json:"maxHealth"`
	Statuses  map[string]int `json:"statuses"` // stacks, by id
	State     []string       `json:"state"`    // what of a condition's `state`s are true of it
}

// ResourceAmount is how much of a resource someone has.
type ResourceAmount struct {
	Have float64 `json:"have"`
	Max  float64 `json:"max"`
}

// Facts is what conditions are read against. Target is nil with no one targeted.
type Facts struct {
	Self      Unit                      `json:"self"`
	Target    *Unit                     `json:"target"`
	TargetIs  []string                  `json:"targetIs"`
	Position  string                    `json:"position"` // behind or inFront of the target
	Since     map[string]float64        `json:"since"`    // seconds, leaving out what's never happened
	Resources map[string]ResourceAmount `json:"resources"`

	// What the server knows, in the middle of a use. Known is false when a condition's asked about
	// something that isn't there to ask, like before an ability has landed: those hold.
	Holders      map[string]int  `json:"-"` // units holding each status from you
	Groups       map[string]bool `json:"-"` // status groups on you
	TargetGroups map[string]bool `json:"-"` // and on your target
	InAreas      map[string]bool `json:"-"` // abilities of yours whose area your target's in
	Used         *UseSoFar       `json:"-"`
}

// UseSoFar is what an ability has done by now, for conditions on its effects.
type UseSoFar struct {
	Spent    float64
	Hits     int
	Crit     bool
	Survived bool
	Landed   bool // a hit has landed, so there's an outcome to ask about
}

func (c *Condition) reads() bool {
	return c.Health != "" || c.Status != "" || c.Not != nil || len(c.AnyOf) > 0 || c.TargetIs != "" || c.State != "" || c.InCombat != nil || c.Position != "" || c.Since != "" || c.Resource != "" || c.Holders != "" || c.InArea != "" || c.SpentAtLeast != nil || c.TargetsHitAtLeast != nil || c.Outcome != "" || c.TargetHealthBelowMine || c.Group != ""
}

func inRange(n float64, c *Condition) bool {
	return (c.Below == nil || n < *c.Below) && (c.Above == nil || n > *c.Above)
}

func has(list []string, want string) bool {
	for _, s := range list {
		if s == want {
			return true
		}
	}
	return false
}

// Holds says whether a condition holds.
func (c *Condition) Holds(f *Facts) bool {
	if !c.reads() {
		return true
	}
	who := &f.Self
	if c.On == "target" || c.Health == "target" {
		who = f.Target
	}
	switch {
	case c.Not != nil:
		return !c.Not.reads() || !c.Not.Holds(f)
	case len(c.AnyOf) > 0:
		for i := range c.AnyOf {
			if c.AnyOf[i].Holds(f) {
				return true
			}
		}
		return false
	case c.Holders != "":
		if f.Holders == nil {
			return true
		}
		n := float64(f.Holders[c.Holders])
		return (c.AtLeast == nil || n >= *c.AtLeast) && (c.AtMost == nil || n <= *c.AtMost)
	case c.InArea != "":
		return f.InAreas == nil || f.InAreas[c.InArea]
	case c.SpentAtLeast != nil:
		return f.Used == nil || f.Used.Spent >= *c.SpentAtLeast
	case c.TargetsHitAtLeast != nil:
		return f.Used == nil || f.Used.Hits >= *c.TargetsHitAtLeast
	case c.Outcome != "":
		if f.Used == nil || !f.Used.Landed {
			return true
		}
		if c.Outcome == "crit" {
			return f.Used.Crit
		}
		return f.Used.Survived
	case c.TargetHealthBelowMine:
		return f.Target == nil || f.Target.Health < f.Self.Health
	case c.Group != "":
		groups := f.Groups
		if c.On == "target" {
			groups = f.TargetGroups
		}
		return groups == nil || groups[c.Group]
	case c.Health != "":
		return who != nil && who.MaxHealth > 0 && inRange(100*who.Health/who.MaxHealth, c)
	case c.Status != "":
		return who != nil && who.Statuses[c.Status] >= max(c.Stacks, 1)
	case c.TargetIs != "":
		return has(f.TargetIs, c.TargetIs)
	case c.State != "":
		return who != nil && has(who.State, c.State)
	case c.InCombat != nil:
		return has(f.Self.State, "inCombat") == *c.InCombat
	case c.Position != "":
		return f.Target != nil && f.Position == c.Position
	case c.Since != "":
		seconds, ok := f.Since[c.Since]
		if !ok {
			return c.Above != nil // it's been forever
		}
		return inRange(seconds, c)
	}
	r, ok := f.Resources[c.Resource]
	if !ok {
		return false
	}
	if c.Percent {
		return r.Max > 0 && inRange(100*r.Have/r.Max, c)
	}
	return inRange(r.Have, c)
}

// All says whether every condition holds, and the first that doesn't if not.
func All(list []Condition, f *Facts) (*Condition, bool) {
	for i := range list {
		if !list[i].Holds(f) {
			return &list[i], false
		}
	}
	return nil, true
}

// Why says what's wrong, for a condition that doesn't hold. name gives a status's name by id.
func (c *Condition) Why(name func(string) string) string {
	high := c.Below != nil
	who, whose := "you", "your"
	if c.On == "target" || c.Health == "target" {
		who, whose = "your target", "your target's"
	}
	switch {
	case c.Not != nil && c.Not.Status != "":
		if c.Not.On == "target" {
			return "your target already has " + name(c.Not.Status)
		}
		return "you already have " + name(c.Not.Status)
	case c.Health != "":
		if high {
			return whose + " health is too high"
		}
		return whose + " health is too low"
	case c.Status != "":
		if who == "you" {
			return "you need " + name(c.Status)
		}
		return "your target needs " + name(c.Status)
	case c.InCombat != nil:
		if *c.InCombat {
			return "you need to be in combat"
		}
		return "you can't do that in combat"
	case c.Position != "":
		if c.Position == "behind" {
			return "you need to be behind your target"
		}
		return "you need to be in front of your target"
	case c.Resource != "":
		if high {
			return "you have too much " + c.Resource
		}
		return "not enough " + c.Resource
	case c.TargetIs != "":
		return "you can't use that on this target"
	}
	return "you can't do that now"
}
