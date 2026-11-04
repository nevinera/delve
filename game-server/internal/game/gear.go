package game

import (
	"cmp"
	"encoding/json"
	"slices"

	"github.com/delve-mmo/delve3d/game-server/internal/combat"
)

// gearFor is what a character of a class and build holds until there's real gear: the class's first
// choices that suit what its specialization's abilities ask for. Empty if the class holds nothing.
func gearFor(class *combat.Class, b combat.Build) (main, off string) {
	if len(class.Weapons) == 0 {
		return "", ""
	}
	first := func(from, among []string) string {
		for _, kind := range from {
			if kind != "none" && slices.Contains(among, kind) {
				return kind
			}
		}
		return ""
	}
	main, off = class.Weapons[0], first(class.Offhands, offHands)
	oneHand := first(class.Weapons, oneHanded)
	switch wieldingOf(class, b) {
	case "twoHanded":
		main, off = cmp.Or(first(class.Weapons, twoHanded), main), "none"
	case "shield":
		main, off = cmp.Or(oneHand, main), "shield"
	case "dual":
		main, off = cmp.Or(oneHand, main), first(class.Offhands, oneHanded)
	case "oneHanded":
		main, off = cmp.Or(oneHand, main), "none"
	}
	if off == "" || slices.Contains(twoHanded, main) {
		off = "none"
	}
	return main, off
}

// wieldingOf is what the abilities of a build's specialization ask a character to hold.
func wieldingOf(class *combat.Class, b combat.Build) string {
	for i := range class.Specializations {
		spec := &class.Specializations[i]
		if spec.ID != b.Specialization {
			continue
		}
		for _, id := range spec.Abilities {
			ability := class.Ability(id)
			if ability == nil {
				continue
			}
			for _, need := range ability.Requires {
				if need.Wielding != "" {
					return need.Wielding
				}
			}
		}
	}
	return ""
}

// wear puts weapons in a character's look, and says if that changed it.
func (p *Player) wear(main, off string) bool {
	look := map[string]any{}
	if err := json.Unmarshal(p.state.Look, &look); err != nil {
		return false
	}
	if body, ok := look["body"]; ok && body != "humanoid" {
		return false
	}
	if look["weapon"] == main && look["offhand"] == off {
		return false
	}
	look["weapon"], look["offhand"] = main, off
	encoded, err := json.Marshal(look)
	if err != nil {
		return false
	}
	p.state.Look = encoded
	return true
}

// wearGear gives a character what its class and build hold, unless it picked its own, and says if
// that changed its look.
func (p *Player) wearGear() bool {
	f := &p.fight
	if f.class == nil || f.ownWeapons {
		return false
	}
	main, off := gearFor(f.class, f.build)
	return main != "" && p.wear(main, off)
}

// holdsOwnWeapon says whether a look came with a weapon of its own.
func holdsOwnWeapon(raw json.RawMessage) bool {
	var look struct {
		Weapon string `json:"weapon"`
	}
	return json.Unmarshal(raw, &look) == nil && look.Weapon != "" && look.Weapon != "none"
}
