package instanceconfig

// Item defines a piece of gear that can drop from a unit's loot table in this zone.
type Item struct {
	Identifier  string    `json:"identifier"` // Required: unique within the zone
	Name        string    `json:"name"`       // Required: display name
	Slot        string    `json:"slot"`       // Required: equipment slot (e.g. "chest", "ring")
	Ilvl        int       `json:"ilvl"`       // Required: item level ≥ 0
	Description string    `json:"description,omitempty"`
	Stats       ItemStats `json:"stats,omitempty"`
}

// ItemStats holds the optional stat bonuses granted by an item.
type ItemStats struct {
	Strength          int     `json:"strength,omitempty"`
	Agility           int     `json:"agility,omitempty"`
	Intellect         int     `json:"intellect,omitempty"`
	Stamina           int     `json:"stamina,omitempty"`
	CritRating        int     `json:"crit_rating,omitempty"`
	HasteRating       int     `json:"haste_rating,omitempty"`
	MasteryRating     int     `json:"mastery_rating,omitempty"`
	VersatilityRating int     `json:"versatility_rating,omitempty"`
	ResilienceRating  int     `json:"resilience_rating,omitempty"`
	WeaponDPS         float64 `json:"weapon_dps,omitempty"`
}

// EquippedItem is a character item equipped in a particular slot, as reported
// by Rails on join. Provenance fields let the game server validate that the
// item is legitimate for its source zone/version.
type EquippedItem struct {
	Identifier     string    `json:"identifier"`
	SourceKey      string    `json:"source_key"`
	ZoneIdentifier string    `json:"zone_identifier"`
	Version        string    `json:"version"`
	Ilvl           int       `json:"ilvl"`
	Stats          ItemStats `json:"stats"`
}
