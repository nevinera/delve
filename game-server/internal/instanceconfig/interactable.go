package instanceconfig

// DefaultInteractableUseTime is how long using an interactable takes, in
// seconds, when it doesn't say.
const DefaultInteractableUseTime = 1.0

// Interactable is a stamp on a map a player uses for a quest's `use`
// objective (see docs/schema/map.md#interactable). Each player uses it for
// themselves: nothing about it changes for anyone else.
type Interactable struct {
	Identifier string   `json:"identifier"`        // Required: unique among the zone's interactables
	Name       string   `json:"name"`              // Required
	Position   Position `json:"position"`          // Required: its middle
	UseTime    *float64 `json:"useTime,omitempty"` // seconds; nil is DefaultInteractableUseTime
	UseText    string   `json:"useText,omitempty"`
	// stamp, usedStamp, their variants, scale and whenUnavailable are the
	// client's: how it's drawn. encoding/json ignores them.
}

// UseSeconds is how long using it takes.
func (i Interactable) UseSeconds() float64 {
	if i.UseTime == nil {
		return DefaultInteractableUseTime
	}
	return *i.UseTime
}
