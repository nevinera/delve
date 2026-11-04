package combat

import (
	"encoding/json"
	"os"
	"testing"
)

func TestConditions(t *testing.T) {
	b, err := os.ReadFile("testdata/conditions.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Name      string    `json:"name"`
		Condition Condition `json:"condition"`
		Holds     bool      `json:"holds"`
		Facts
	}
	if err := json.Unmarshal(b, &cases); err != nil {
		t.Fatal(err)
	}
	for _, c := range cases {
		if got := c.Condition.Holds(&c.Facts); got != c.Holds {
			t.Errorf("%s: holds = %v", c.Name, got)
		}
	}
}

func TestWhyAConditionDoesntHold(t *testing.T) {
	name := func(string) string { return "Vigil" }
	twenty := 20.0
	for want, c := range map[string]Condition{
		"your target's health is too high": {Health: "target", Below: &twenty},
		"you already have Vigil":           {Not: &Condition{Status: "a", On: "self"}},
		"your target needs Vigil":          {Status: "a", On: "target"},
		"you need Vigil":                   {Status: "a", On: "self"},
		"not enough mana":                  {Resource: "mana", Above: &twenty},
		"you can't do that now":            {State: "casting"},
	} {
		if got := c.Why(name); got != want {
			t.Errorf("got %q, want %q", got, want)
		}
	}
}
