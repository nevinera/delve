package combat

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"slices"
	"strings"
)

//go:generate go run ../../cmd/classrefs

// classrefs.json is where a class names its statuses, abilities, resources, units and
// specializations, written from the class schema's "x-refers" marks (internal/schemarefs).
//
//go:embed classrefs.json
var classRefsJSON []byte

type refNode struct {
	Refers string              `json:"refers"`
	What   string              `json:"what"`
	Ref    string              `json:"ref"`
	Props  map[string]*refNode `json:"props"`
	Items  *refNode            `json:"items"`
	Values *refNode            `json:"values"`
	Needs  []string            `json:"needs"`
}

var classRefs = func() (m struct {
	Root *refNode            `json:"root"`
	Defs map[string]*refNode `json:"defs"`
}) {
	if err := json.Unmarshal(classRefsJSON, &m); err != nil {
		panic(err)
	}
	return m
}()

func article(kind string) string {
	if kind == "ability" {
		return "an"
	}
	return "a"
}

func needs(where, kind string) string {
	return fmt.Sprintf("%s needs %s %s picked.", where, article(kind), kind)
}

// ReferenceProblems is what in a class, as JSON, names something the class doesn't have, as
// sentences: the same check the class editor makes (client/src/classes/classFile.js).
func ReferenceProblems(raw []byte) ([]string, error) {
	var made map[string]any
	if err := json.Unmarshal(raw, &made); err != nil {
		return nil, err
	}
	has := map[string]map[string]bool{}
	for kind, list := range map[string]string{"status": "statuses", "ability": "abilities", "unit": "units", "specialization": "specializations"} {
		has[kind] = ids(made[list], "id")
	}
	has["resource"] = ids(made["resources"], "key")
	var problems []string
	add := func(p string) {
		if !slices.Contains(problems, p) {
			problems = append(problems, p)
		}
	}
	var walk func(n *refNode, v any, where string)
	walk = func(n *refNode, v any, where string) {
		if n == nil || v == nil {
			return
		}
		if n.Ref != "" {
			walk(classRefs.Defs[n.Ref], v, where)
		}
		obj, _ := v.(map[string]any)
		if n.What != "" && obj != nil {
			where = n.What
			if name, _ := obj["name"].(string); name != "" {
				where = name
			}
		}
		if n.Refers != "" {
			id, _ := v.(string)
			if id == "" {
				add(needs(where, n.Refers))
			} else if !has[n.Refers][id] {
				add(fmt.Sprintf("%s points at %s %s this class doesn't have (%s).", where, article(n.Refers), n.Refers, id))
			}
			return
		}
		for _, key := range sortedKeys(n.Props) {
			if obj == nil {
				break
			}
			if _, there := obj[key]; !there && slices.Contains(n.Needs, key) {
				add(needs(where, n.Props[key].Refers))
			}
			walk(n.Props[key], obj[key], where)
		}
		if list, ok := v.([]any); ok && n.Items != nil {
			for _, each := range list {
				walk(n.Items, each, where)
			}
		}
		if obj != nil && n.Values != nil {
			for _, key := range sortedKeys(obj) {
				walk(n.Values, obj[key], where)
			}
		}
	}
	walk(classRefs.Root, made, "The class")
	return problems, nil
}

func ids(list any, key string) map[string]bool {
	out := map[string]bool{}
	items, _ := list.([]any)
	for _, each := range items {
		if m, ok := each.(map[string]any); ok {
			if id, ok := m[key].(string); ok {
				out[id] = true
			}
		}
	}
	return out
}

func sortedKeys[V any](m map[string]V) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	slices.SortFunc(keys, strings.Compare)
	return keys
}
