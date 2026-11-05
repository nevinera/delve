package combat

import (
	"bytes"
	"os"
	"testing"
)

func TestHomewardMatchesTheClients(t *testing.T) {
	client, err := os.ReadFile("../../../client/src/abilities/homeward.json")
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(client, homewardJSON) {
		t.Fatal("client/src/abilities/homeward.json and homeward.json differ")
	}
}

func TestWithHomewardReplacesAClasssOwn(t *testing.T) {
	c := &Class{Abilities: []Ability{{ID: "strike"}, {ID: HomewardID, Name: "Mine"}}}
	c.WithHomeward()
	if len(c.Abilities) != 2 || c.Abilities[0].ID != "strike" || c.Abilities[1].Name != "Homeward" || c.Abilities[1].CastTime != 10 {
		t.Fatalf("got %+v", c.Abilities)
	}
	if !c.Knows(c.Ability(HomewardID), 1, Build{}) {
		t.Fatal("a level 1 character should know Homeward")
	}
}
