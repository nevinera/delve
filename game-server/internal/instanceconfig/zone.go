package instanceconfig

import (
	"bytes"
	"encoding/json"
	"errors"
)

// Zone is a discrete location in the world, made up of one or more maps.
// The game server always receives fully-resolved (concrete) zone configs —
// all AssetReferences must be inlined before delivery. If a $ref key is
// encountered during parsing, Unmarshal returns a clear error.
type Zone struct {
	Name        string              `json:"name"` // Required: display name
	Description string              `json:"description,omitempty"`
	Private     bool                `json:"private"` // Required: true = party-instanced, false = shared
	Elvl        int                 `json:"elvl"`    // Required: elevation - see docs/stats.md
	Maps        []Map               `json:"maps"`    // Required: at least one
	UnitTypes   map[string]UnitType `json:"unitTypes,omitempty"`
	Items       map[string]Item     `json:"items,omitempty"`
	ZoneLinks   []ZoneLink          `json:"zoneLinks,omitempty"`
	// EntryPoints maps "mapId/connectionId" to an optional required key identifier.
	EntryPoints map[string]*string `json:"entryPoints,omitempty"`
	// OpenConnections maps "mapId/connectionId" to a zone-level name.
	OpenConnections map[string]string `json:"openConnections,omitempty"`
}

func (z *Zone) UnmarshalJSON(data []byte) error {
	// Scan the full document for any $ref key. The game server only accepts
	// fully-resolved concrete configs; abstract configs with AssetReferences
	// must be resolved by the Rails app before delivery.
	if bytes.Contains(data, []byte(`"$ref"`)) {
		return errors.New(
			`zone config contains an unresolved AssetReference ("$ref"); ` +
				`the Rails app must send a fully-resolved concrete config`,
		)
	}
	// Use a type alias to call the default unmarshaler without infinite recursion.
	type plain Zone
	return json.Unmarshal(data, (*plain)(z))
}

// MapElvl returns the effective elevation (docs/stats.md) of the named map:
// the map's own Elvl override if set, otherwise the zone's Elvl. Returns the
// zone's Elvl if no map with that identifier is found.
func (z *Zone) MapElvl(mapIdentifier string) float64 {
	for _, m := range z.Maps {
		if m.Identifier == mapIdentifier {
			if m.Elvl != nil {
				return float64(*m.Elvl)
			}
			break
		}
	}
	return float64(z.Elvl)
}

// ZoneLink connects two MapConnections so that traversing one transports a
// unit to the other.
type ZoneLink struct {
	ConnectionA ConnectionIdentifier `json:"connectionA"` // Required
	ConnectionB ConnectionIdentifier `json:"connectionB"` // Required
	OneWay      bool                 `json:"oneWay"`      // Required
	RequiredKey *string              `json:"requiredKey"` // Required (may be null)
}

// ConnectionIdentifier references a specific connection on a specific map.
type ConnectionIdentifier struct {
	Map        string `json:"map"`        // Required: map identifier
	Connection string `json:"connection"` // Required: connection identifier
}
