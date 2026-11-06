// Package schemarefs finds where a JSON Schema's documents refer to other things, by the
// "x-refers" marks on their fields, and writes it as a Map: a small tree of where those fields are,
// which a walker follows through a document to check each one.
//
// A Node's Refers is what its field names, by id or key. Needs are its properties that refer to
// something and are required, so a missing one is a problem too. Props are its object's properties, Items
// an array's, and Values an object's for any key. Ref is another node, in Defs, for the parts of
// the schema that refer to themselves. What labels the things the problems are about ("An
// ability"), as its schema's "x-what" says. oneOf, anyOf and allOf merge into one node, so a
// field means the same in each of them.
package schemarefs

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strconv"
	"strings"
)

// Map is where a schema's documents refer to things.
type Map struct {
	Root *Node            `json:"root"`
	Defs map[string]*Node `json:"defs,omitempty"`
}

// Node is a place in a document, and what's under it that refers to things.
type Node struct {
	Refers string           `json:"refers,omitempty"`
	What   string           `json:"what,omitempty"`
	Ref    string           `json:"ref,omitempty"`
	Props  map[string]*Node `json:"props,omitempty"`
	Items  *Node            `json:"items,omitempty"`
	Values *Node            `json:"values,omitempty"`
	// Needs are the properties that refer to something and have to be there.
	Needs []string `json:"needs,omitempty"`
}

type compiler struct {
	dir   string
	files map[string]map[string]any
	defs  map[string]*Node
}

// Compile reads the schema at dir/file and maps where its documents refer to things.
func Compile(dir, file string) (*Map, error) {
	c := &compiler{dir: dir, files: map[string]map[string]any{}, defs: map[string]*Node{}}
	root, err := c.file(file)
	if err != nil {
		return nil, err
	}
	n, err := c.node(file, root)
	if err != nil {
		return nil, err
	}
	m := &Map{Root: n, Defs: c.defs}
	m.prune()
	return m, nil
}

func (c *compiler) file(name string) (map[string]any, error) {
	if f, ok := c.files[name]; ok {
		return f, nil
	}
	raw, err := os.ReadFile(filepath.Join(c.dir, name))
	if err != nil {
		return nil, err
	}
	var f map[string]any
	if err := json.Unmarshal(raw, &f); err != nil {
		return nil, fmt.Errorf("%s: %w", name, err)
	}
	c.files[name] = f
	return f, nil
}

// resolve finds a $ref from within file: the file it's in, and the schema there.
func (c *compiler) resolve(file, ref string) (string, any, error) {
	target, pointer, _ := strings.Cut(ref, "#")
	if target == "" {
		target = file
	}
	f, err := c.file(target)
	if err != nil {
		return "", nil, err
	}
	var at any = f
	for _, part := range strings.Split(strings.TrimPrefix(pointer, "/"), "/") {
		if part == "" {
			continue
		}
		switch x := at.(type) {
		case map[string]any:
			at = x[part]
		case []any:
			i, err := strconv.Atoi(part)
			if err != nil || i < 0 || i >= len(x) {
				return "", nil, fmt.Errorf("%s: no %s", file, ref)
			}
			at = x[i]
		}
		if at == nil {
			return "", nil, fmt.Errorf("%s: no %s", file, ref)
		}
	}
	return target, at, nil
}

// node compiles a schema from file.
func (c *compiler) node(file string, s any) (*Node, error) {
	m, ok := s.(map[string]any)
	if !ok {
		return &Node{}, nil
	}
	n := &Node{}
	if r, ok := m["x-refers"].(string); ok {
		n.Refers = r
	}
	if w, ok := m["x-what"].(string); ok {
		n.What = w
	}
	if ref, ok := m["$ref"].(string); ok && n.Refers == "" {
		target, at, err := c.resolve(file, ref)
		if err != nil {
			return nil, err
		}
		_, pointer, _ := strings.Cut(ref, "#")
		name := target + "#" + pointer
		if _, ok := c.defs[name]; !ok {
			c.defs[name] = &Node{} // while compiling it, for schemas that refer to themselves
			d, err := c.node(target, at)
			if err != nil {
				return nil, err
			}
			c.defs[name] = d
		}
		n.Ref = name
	}
	if props, ok := m["properties"].(map[string]any); ok {
		for key, p := range props {
			child, err := c.node(file, p)
			if err != nil {
				return nil, fmt.Errorf("%s: %w", key, err)
			}
			if n.Props == nil {
				n.Props = map[string]*Node{}
			}
			n.Props[key] = child
		}
	}
	if required, ok := m["required"].([]any); ok {
		for _, r := range required {
			if key, _ := r.(string); n.Props[key] != nil && n.Props[key].Refers != "" {
				n.Needs = append(n.Needs, key)
			}
		}
	}
	if items, ok := m["items"]; ok {
		child, err := c.node(file, items)
		if err != nil {
			return nil, err
		}
		n.Items = child
	}
	var values []any
	if a, ok := m["additionalProperties"].(map[string]any); ok {
		values = append(values, a)
	}
	if pp, ok := m["patternProperties"].(map[string]any); ok {
		for _, p := range pp {
			values = append(values, p)
		}
	}
	for _, v := range values {
		child, err := c.node(file, v)
		if err != nil {
			return nil, err
		}
		if n.Values, err = merge(n.Values, child); err != nil {
			return nil, err
		}
	}
	for _, key := range []string{"oneOf", "anyOf", "allOf"} {
		list, _ := m[key].([]any)
		for _, each := range list {
			child, err := c.node(file, each)
			if err != nil {
				return nil, err
			}
			if key != "allOf" && child != nil {
				child.Needs = nil // each branch's own, not the whole object's
			}
			if n, err = merge(n, child); err != nil {
				return nil, fmt.Errorf("%s: %w", key, err)
			}
		}
	}
	return n, nil
}

// merge puts what b has into a.
func merge(a, b *Node) (*Node, error) {
	if a == nil {
		return b, nil
	}
	if b == nil {
		return a, nil
	}
	for _, f := range []struct {
		to   *string
		from string
	}{{&a.Refers, b.Refers}, {&a.What, b.What}, {&a.Ref, b.Ref}} {
		if f.from == "" {
			continue
		}
		if *f.to != "" && *f.to != f.from {
			return nil, fmt.Errorf("one field means both %q and %q", *f.to, f.from)
		}
		*f.to = f.from
	}
	for key, p := range b.Props {
		if a.Props == nil {
			a.Props = map[string]*Node{}
		}
		var err error
		if a.Props[key], err = merge(a.Props[key], p); err != nil {
			return nil, fmt.Errorf("%s: %w", key, err)
		}
	}
	for _, key := range b.Needs {
		if !slices.Contains(a.Needs, key) {
			a.Needs = append(a.Needs, key)
		}
	}
	var err error
	if a.Items, err = merge(a.Items, b.Items); err != nil {
		return nil, err
	}
	a.Values, err = merge(a.Values, b.Values)
	return a, err
}

// prune drops what has nothing under it that refers to anything.
func (m *Map) prune() {
	useful := map[string]bool{}
	var has func(n *Node) bool
	has = func(n *Node) bool {
		if n == nil {
			return false
		}
		found := n.Refers != "" || (n.Ref != "" && useful[n.Ref])
		for _, p := range n.Props {
			found = has(p) || found
		}
		return has(n.Items) || has(n.Values) || found
	}
	for changed := true; changed; {
		changed = false
		for name, d := range m.Defs {
			if !useful[name] && has(d) {
				useful[name], changed = true, true
			}
		}
	}
	var cut func(n *Node) *Node
	cut = func(n *Node) *Node {
		if n == nil {
			return nil
		}
		if n.Ref != "" && !useful[n.Ref] {
			n.Ref = ""
		}
		for key, p := range n.Props {
			if n.Props[key] = cut(p); n.Props[key] == nil {
				delete(n.Props, key)
			}
		}
		if len(n.Props) == 0 {
			n.Props = nil
		}
		n.Items, n.Values = cut(n.Items), cut(n.Values)
		slices.Sort(n.Needs)
		if n.Refers == "" && n.Ref == "" && n.Props == nil && n.Items == nil && n.Values == nil {
			return nil
		}
		return n
	}
	for name := range m.Defs {
		if !useful[name] {
			delete(m.Defs, name)
		}
	}
	for name, d := range m.Defs {
		m.Defs[name] = cut(d)
	}
	m.Root = cut(m.Root)
}

// JSON is the map as JSON, the same each time.
func (m *Map) JSON() ([]byte, error) {
	b, err := json.MarshalIndent(m, "", "  ")
	return append(b, '\n'), err
}

// Kinds is every kind of thing the map refers to.
func (m *Map) Kinds() []string {
	set := map[string]bool{}
	var walk func(n *Node)
	walk = func(n *Node) {
		if n == nil {
			return
		}
		if n.Refers != "" {
			set[n.Refers] = true
		}
		for _, p := range n.Props {
			walk(p)
		}
		walk(n.Items)
		walk(n.Values)
	}
	walk(m.Root)
	for _, d := range m.Defs {
		walk(d)
	}
	var kinds []string
	for k := range set {
		kinds = append(kinds, k)
	}
	sort.Strings(kinds)
	return kinds
}
