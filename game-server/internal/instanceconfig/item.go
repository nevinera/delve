package instanceconfig

// Item defines a piece of gear that can drop from a unit's loot table in this zone.
// There are no baked-in stat values - only which primary stat (if any) and which
// secondaries it rolls. Actual numbers are computed from Elvl/slot/em at runtime;
// see the itemstats package.
type Item struct {
	Identifier  string   `json:"identifier"`           // Required: unique within the zone
	Name        string   `json:"name"`                 // Required: display name
	Slot        string   `json:"slot"`                 // Required: equipment slot (e.g. "chest", "ring")
	Elvl        int      `json:"elvl"`                 // Required: elevation ≥ 0
	Shield      bool     `json:"shield,omitempty"`     // Only meaningful when Slot is "off_hand"
	WeaponType  *string  `json:"weaponType,omitempty"` // Set only when this item is an actual weapon; nil otherwise
	Primary     *string  `json:"primary,omitempty"`    // One of strength/agility/intellect, or nil
	Secondaries []string `json:"secondaries,omitempty"`
	Description string   `json:"description,omitempty"`
}

// EquippedItem is a character item equipped in a particular slot, as reported
// by Rails on join. Provenance fields let the game server validate that the
// item is legitimate for its source zone/version.
type EquippedItem struct {
	Identifier     string   `json:"identifier"`
	SourceKey      string   `json:"source_key"`
	ZoneIdentifier string   `json:"zone_identifier"`
	Version        string   `json:"version"`
	Slot           string   `json:"slot"`
	Elvl           int      `json:"elvl"`
	Shield         bool     `json:"shield"`
	WeaponType     *string  `json:"weapon_type"`
	PrimaryStat    *string  `json:"primary_stat"`
	SecondaryStats []string `json:"secondary_stats"`
}
