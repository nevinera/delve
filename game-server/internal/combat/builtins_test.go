package combat

import (
	"bytes"
	"os"
	"testing"
)

func TestBuiltinsMatchTheClients(t *testing.T) {
	client, err := os.ReadFile("../../../client/src/abilities/builtins.json")
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(client, builtinsJSON) {
		t.Fatal("client/src/abilities/builtins.json and builtins.json differ")
	}
}

func TestWithBuiltinsReplacesAClasssOwn(t *testing.T) {
	c := &Class{Abilities: []Ability{{ID: "strike"}, {ID: HomewardID, Name: "Mine"}}, Statuses: []Status{{ID: RestingID, Name: "Mine"}}}
	c.WithBuiltins()
	if len(c.Abilities) != 2 || c.Abilities[0].ID != "strike" || c.Abilities[1].Name != "Homeward" || c.Abilities[1].CastTime != 10 {
		t.Fatalf("got %+v", c.Abilities)
	}
	if len(c.Statuses) != 1 || c.Status(RestingID).Name != "Resting" {
		t.Fatalf("got %+v", c.Statuses)
	}
	if !c.Knows(c.Ability(HomewardID), 1, Build{}) {
		t.Fatal("a level 1 character should know Homeward")
	}
}
