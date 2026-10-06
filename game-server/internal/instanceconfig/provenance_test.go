package instanceconfig

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func str(s string) *string { return &s }
func num(n int) *int       { return &n }

func TestProvenanceRestrictions_Allows(t *testing.T) {
	trainee := EquippedItem{Elvl: 900}
	home := EquippedItem{Elvl: 100, WorldKey: str("home")}
	other := EquippedItem{Elvl: 100, WorldKey: str("other")}
	high := EquippedItem{Elvl: 500, WorldKey: str("home")}

	tests := []struct {
		name   string
		layers []ProvenanceLayer
		item   EquippedItem
		want   bool
	}{
		{"no layers allow anything", nil, other, true},
		{"trainee gear always passes", []ProvenanceLayer{{Worlds: []string{}, MaxElevation: num(0)}}, trainee, true},
		{"nil worlds means any world", []ProvenanceLayer{{}}, other, true},
		{"empty worlds allows only the own world", []ProvenanceLayer{{Worlds: []string{}}}, home, true},
		{"empty worlds rejects another world", []ProvenanceLayer{{Worlds: []string{}}}, other, false},
		{"listed world passes", []ProvenanceLayer{{Worlds: []string{"other"}}}, other, true},
		{"above max elevation fails", []ProvenanceLayer{{MaxElevation: num(400)}}, high, false},
		{"at max elevation passes", []ProvenanceLayer{{MaxElevation: num(500)}}, high, true},
		{"every layer must pass", []ProvenanceLayer{{Worlds: []string{"other"}}, {MaxElevation: num(50)}}, other, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := ProvenanceRestrictions{WorldKey: "home", Layers: tt.layers}
			assert.Equal(t, tt.want, r.Allows(tt.item))
		})
	}
}

func TestProvenanceRestrictions_Worn(t *testing.T) {
	r := ProvenanceRestrictions{WorldKey: "home", Layers: []ProvenanceLayer{{Worlds: []string{}}}}
	equipped := map[string]EquippedItem{
		"head":  {Slot: "head", WorldKey: str("home")},
		"chest": {Slot: "chest", WorldKey: str("other")},
		"feet":  {Slot: "feet"},
	}

	worn := r.Worn(equipped)

	assert.Len(t, worn, 2)
	assert.Contains(t, worn, "head")
	assert.Contains(t, worn, "feet")
	assert.Len(t, equipped, 3, "the input map is left alone")
}

func TestProvenanceRestrictions_WornKeepsNilAndUnrestricted(t *testing.T) {
	assert.Nil(t, ProvenanceRestrictions{Layers: []ProvenanceLayer{{}}}.Worn(nil))
	equipped := map[string]EquippedItem{"head": {Slot: "head", WorldKey: str("x")}}
	assert.Equal(t, equipped, ProvenanceRestrictions{}.Worn(equipped))
}
