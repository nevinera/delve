package instanceconfig

// DefaultInteractableUseTime is how long using an interactable takes, in
// seconds, when it doesn't say.
const DefaultInteractableUseTime = 1.0

// Interactable is an image on a map a player uses for a quest's `use`
// objective (see docs/schema/map.md#interactable). Each player uses it for
// themselves: nothing about it changes for anyone else.
type Interactable struct {
	Identifier string   `json:"identifier"`        // Required: unique among the zone's interactables
	Name       string   `json:"name"`              // Required
	Size       Size     `json:"size"`              // Required: feet
	Position   Position `json:"position"`          // Required: its middle
	UseTime    *float64 `json:"useTime,omitempty"` // seconds; nil is DefaultInteractableUseTime
	UseText    string   `json:"useText,omitempty"`
	// imageUrl, usedImageUrl and whenUnavailable are the client's: how
	// it's drawn. encoding/json ignores them.
}

// Size is a width and height, in feet.
type Size struct {
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

// UseSeconds is how long using it takes.
func (i Interactable) UseSeconds() float64 {
	if i.UseTime == nil {
		return DefaultInteractableUseTime
	}
	return *i.UseTime
}

// Reach is how far its edge is from its middle, in feet: half its larger
// side, so range to use it is measured from about its edge.
func (i Interactable) Reach() float64 {
	return max(i.Size.Width, i.Size.Height) / 2
}
