package instanceconfig_test

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

func parseCharacterClass(t *testing.T, data []byte) instanceconfig.CharacterClass {
	t.Helper()
	var c instanceconfig.CharacterClass
	require.NoError(t, json.Unmarshal(data, &c))
	return c
}

func TestCharacterClass_ValidFull(t *testing.T) {
	c := parseCharacterClass(t, loadFixture(t, "valid_character_class.json"))

	assert.Equal(t, "Puncher", c.Name)
	assert.Equal(t, "A bare-knuckle brawler who solves every problem with their fists.", c.Description)
	assert.Equal(t, "8B4513", c.Colors.Major)
	assert.Equal(t, "F4A460", c.Colors.Minor)
	assert.Len(t, c.Powers, 2)
	assert.Empty(t, c.Resources)
	assert.Equal(t, []string{"strength"}, c.PrimaryStats)
	assert.Equal(t, []string{"crit_rating", "haste_rating", "mastery_rating", "versatility_rating", "stamina"}, c.SecondaryStats)
	assert.Equal(t, []string{"dagger", "dagger"}, c.Wields)
}

func TestCharacterClass_DamageStatKey(t *testing.T) {
	assert.Equal(t, "strength", instanceconfig.CharacterClass{PrimaryStats: []string{"strength"}}.DamageStatKey())
	assert.Equal(t, "agility", instanceconfig.CharacterClass{PrimaryStats: []string{"agility"}}.DamageStatKey())
	assert.Equal(t, "intellect", instanceconfig.CharacterClass{PrimaryStats: []string{"intellect"}}.DamageStatKey())
	assert.Equal(t, "", instanceconfig.CharacterClass{}.DamageStatKey())
	// first strength/agility/intellect entry wins, in listed order
	assert.Equal(t, "intellect", instanceconfig.CharacterClass{PrimaryStats: []string{"intellect", "agility"}}.DamageStatKey())
}

func TestCharacterClass_Powers(t *testing.T) {
	c := parseCharacterClass(t, loadFixture(t, "valid_character_class.json"))

	punch := c.Powers[0]
	assert.Equal(t, "Punch", punch.Name)
	assert.Nil(t, punch.CastTime)
	assert.Equal(t, 1.5, punch.GlobalCooldown)
	require.Len(t, punch.Effects, 1)
	assert.Equal(t, "harm", punch.Effects[0].Type)
	assert.Equal(t, "bTarget", punch.Effects[0].Affects)
	assert.Equal(t, []string{"physical", "melee"}, punch.Effects[0].Tags)
	require.NotNil(t, punch.Effects[0].Amount)
	assert.Equal(t, 8.0, punch.Effects[0].Amount.Min())
	assert.Equal(t, 14.0, punch.Effects[0].Amount.Max())

	recover := c.Powers[1]
	assert.Equal(t, "Recover", recover.Name)
	assert.Equal(t, 10.0, recover.GlobalCooldown)
	require.Len(t, recover.Effects, 1)
	assert.Equal(t, "heal", recover.Effects[0].Type)
	assert.Equal(t, "self", recover.Effects[0].Affects)
}

func TestCharacterClass_GraphicAndSoundEffectsIgnored(t *testing.T) {
	c := parseCharacterClass(t, loadFixture(t, "valid_character_class.json"))
	// graphicEffects and soundEffects are client-only; parsing must not error
	// even though they appear in the fixture.
	assert.Len(t, c.Powers, 2)
}

func TestCharacterClass_AssetReferenceRejected(t *testing.T) {
	data := []byte(`{"name": "Puncher", "$ref": "./other.json", "colors": {"major": "000000", "minor": "ffffff"}, "powers": []}`)
	var c instanceconfig.CharacterClass
	err := json.Unmarshal(data, &c)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "$ref")
	assert.Contains(t, err.Error(), "fully-resolved")
}

func TestCharacterClass_MalformedJSON(t *testing.T) {
	var c instanceconfig.CharacterClass
	err := json.Unmarshal([]byte(`{not json`), &c)
	assert.Error(t, err)
}

func TestCharacterClass_PrimaryResource(t *testing.T) {
	energy := instanceconfig.ResourceType{Name: "energy", Max: 100, DisplayType: "primary"}
	comboPoints := instanceconfig.ResourceType{Name: "combo points", Max: 5}
	c := instanceconfig.CharacterClass{Resources: []instanceconfig.ResourceType{comboPoints, energy}}

	assert.Equal(t, energy, c.PrimaryResource())
}

func TestCharacterClass_PrimaryResourceZeroValueWhenNoneMarked(t *testing.T) {
	c := instanceconfig.CharacterClass{
		Resources: []instanceconfig.ResourceType{{Name: "combo points", Max: 5}},
	}
	assert.Equal(t, instanceconfig.ResourceType{}, c.PrimaryResource())
}

func TestCharacterClass_PrimaryResourceZeroValueWithNoResources(t *testing.T) {
	assert.Equal(t, instanceconfig.ResourceType{}, instanceconfig.CharacterClass{}.PrimaryResource())
}
