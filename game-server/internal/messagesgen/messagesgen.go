// Package messagesgen writes the game server's message structs and the play page's table of
// message types from the protocol's schema, docs/schema/messages.schema.json.
//
// Each message's struct is named by its "x-go", and its fields follow the order of its properties,
// as the server builds some by position. A field's Go name and type follow from its JSON name and
// schema, unless "x-go-name" or "x-go-type" says otherwise: integers are int64, numbers float64,
// a point [3]float64, and a $ref the struct its definition names. Optional fields are omitempty.
// "x-go-embed" embeds that struct for the properties it has. The client's messages make one struct,
// named by fromClient's "x-go", with every field any of them has.
package messagesgen

import (
	"bytes"
	"encoding/json"
	"fmt"
	"go/format"
	"slices"
	"strings"
)

// Header starts each file written, so no one edits it by hand.
const Header = "Written by `go generate ./internal/game` in game-server, from docs/schema/messages.schema.json. Don't edit it: change the schema."

type schema struct {
	Ref         string          `json:"$ref"`
	Type        string          `json:"type"`
	Const       string          `json:"const"`
	Description string          `json:"description"`
	Properties  ordered         `json:"properties"`
	Required    []string        `json:"required"`
	Items       *schema         `json:"items"`
	MinItems    *int            `json:"minItems"`
	MaxItems    *int            `json:"maxItems"`
	Additional  json.RawMessage `json:"additionalProperties"`
	OneOf       []schema        `json:"oneOf"`
	Go          string          `json:"x-go"`
	GoName      string          `json:"x-go-name"`
	GoType      string          `json:"x-go-type"`
	GoEmbed     string          `json:"x-go-embed"`
	empty       bool
}

func (s *schema) UnmarshalJSON(b []byte) error {
	type plain schema
	if err := json.Unmarshal(b, (*plain)(s)); err != nil {
		return err
	}
	s.empty = bytes.Equal(bytes.TrimSpace(b), []byte("{}"))
	return nil
}

// ordered is an object's properties, in the order the schema has them.
type ordered struct {
	keys  []string
	props map[string]*schema
}

func (o *ordered) UnmarshalJSON(b []byte) error {
	o.props = map[string]*schema{}
	dec := json.NewDecoder(bytes.NewReader(b))
	if _, err := dec.Token(); err != nil {
		return err
	}
	for dec.More() {
		t, err := dec.Token()
		if err != nil {
			return err
		}
		key := t.(string)
		var s schema
		if err := dec.Decode(&s); err != nil {
			return err
		}
		o.keys = append(o.keys, key)
		o.props[key] = &s
	}
	return nil
}

type doc struct {
	Defs map[string]*schema `json:"$defs"`
}

type gen struct {
	defs map[string]*schema
	out  strings.Builder
}

func read(raw []byte) (*gen, error) {
	var d doc
	if err := json.Unmarshal(raw, &d); err != nil {
		return nil, err
	}
	return &gen{defs: d.Defs}, nil
}

func (g *gen) ref(s *schema) (string, *schema) {
	name := s.Ref[strings.LastIndex(s.Ref, "/")+1:]
	return name, g.defs[name]
}

// goType is the Go type for a property's schema.
func (g *gen) goType(s *schema) (string, error) {
	if s.GoType != "" {
		return s.GoType, nil
	}
	if s.Ref != "" {
		name, def := g.ref(s)
		if name == "point" {
			return "[3]float64", nil
		}
		if def == nil || def.Go == "" {
			return "", fmt.Errorf("%s has no x-go", s.Ref)
		}
		return def.Go, nil
	}
	if s.empty {
		return "json.RawMessage", nil
	}
	switch s.Type {
	case "integer":
		return "int64", nil
	case "number":
		return "float64", nil
	case "string":
		return "string", nil
	case "boolean":
		return "bool", nil
	case "array":
		item, err := g.goType(s.Items)
		if err != nil {
			return "", err
		}
		if s.MinItems != nil && s.MaxItems != nil && *s.MinItems == *s.MaxItems {
			return fmt.Sprintf("[%d]%s", *s.MinItems, item), nil
		}
		return "[]" + item, nil
	case "object":
		var value schema
		if err := json.Unmarshal(s.Additional, &value); err != nil {
			return "", fmt.Errorf("an object needs additionalProperties: %w", err)
		}
		v, err := g.goType(&value)
		return "map[string]" + v, err
	}
	return "", fmt.Errorf("no Go type for %+v", *s)
}

var initialisms = map[string]string{"id": "ID", "gcd": "GCD", "dps": "DPS"}

func goName(key string, s *schema) string {
	if s.GoName != "" {
		return s.GoName
	}
	if n, ok := initialisms[key]; ok {
		return n
	}
	return strings.ToUpper(key[:1]) + key[1:]
}

func (g *gen) comment(text, indent string) {
	line := indent + "//"
	for _, word := range strings.Fields(text) {
		if len(line)+1+len(word) > 100 && line != indent+"//" {
			g.out.WriteString(line + "\n")
			line = indent + "//"
		}
		line += " " + word
	}
	g.out.WriteString(line + "\n")
}

// field writes one property's field. omit says whether it's omitempty.
func (g *gen) field(key string, s *schema, omit bool) error {
	t, err := g.goType(s)
	if err != nil {
		return fmt.Errorf("%s: %w", key, err)
	}
	if s.Description != "" {
		g.comment(s.Description, "\t")
	}
	tag := key
	if omit {
		tag += ",omitempty"
	}
	fmt.Fprintf(&g.out, "\t%s %s `json:%q`\n", goName(key, s), t, tag)
	return nil
}

func (g *gen) message(name string) error {
	s := g.defs[name]
	g.comment(fmt.Sprintf("%s: %s", s.Go, lower(s.Description)), "")
	fmt.Fprintf(&g.out, "type %s struct {\n", s.Go)
	var embedded *schema
	for _, def := range g.defs {
		if s.GoEmbed != "" && def.Go == s.GoEmbed {
			embedded = def
		}
	}
	for _, key := range s.Properties.keys {
		p := s.Properties.props[key]
		if key == "type" && p.Const != "" {
			g.out.WriteString("\tType string `json:\"type\"`\n")
			continue
		}
		if embedded != nil && embedded.Properties.props[key] != nil {
			continue
		}
		if err := g.field(key, p, !slices.Contains(s.Required, key)); err != nil {
			return fmt.Errorf("%s: %w", name, err)
		}
	}
	if embedded != nil {
		fmt.Fprintf(&g.out, "\t%s\n", s.GoEmbed)
	}
	g.out.WriteString("}\n\n")
	return nil
}

func lower(s string) string {
	if s == "" {
		return s
	}
	return strings.ToLower(s[:1]) + s[1:]
}

// side is the definitions of one side's messages, in the order its oneOf has them.
func (g *gen) side(name string) []string {
	var names []string
	for _, r := range g.defs[name].OneOf {
		n, _ := g.ref(&r)
		names = append(names, n)
	}
	return names
}

// Go writes the game package's message structs.
func Go(raw []byte) ([]byte, error) {
	g, err := read(raw)
	if err != nil {
		return nil, err
	}
	g.comment(Header, "")
	g.out.WriteString("\npackage game\n\n")
	head := g.out.Len()
	var shared []string
	for name, def := range g.defs {
		if def.Go != "" && !strings.Contains(def.Go, ".") && !strings.Contains(name, ".") && name != "fromClient" {
			shared = append(shared, name)
		}
	}
	slices.Sort(shared)
	for _, name := range append(shared, g.side("fromServer")...) {
		if g.defs[name].Go == "" {
			continue // the server package writes these itself
		}
		if err := g.message(name); err != nil {
			return nil, err
		}
	}
	if err := g.incoming(); err != nil {
		return nil, err
	}
	body := g.out.String()[head:]
	var imports []string
	if strings.Contains(body, "json.") {
		imports = append(imports, `"encoding/json"`)
	}
	if strings.Contains(body, "combat.") {
		imports = append(imports, `"github.com/delve-mmo/delve3d/game-server/internal/combat"`)
	}
	src := g.out.String()[:head] + "import (\n" + strings.Join(imports, "\n") + "\n)\n\n" + body
	return format.Source([]byte(src))
}

// incoming is every field of every client message, in one struct.
func (g *gen) incoming() error {
	from := g.defs["fromClient"]
	g.comment(fmt.Sprintf("%s: %s Each field is in one or more of them.", from.Go, lower(from.Description)), "")
	fmt.Fprintf(&g.out, "type %s struct {\n\tType string `json:\"type\"`\n", from.Go)
	seen := map[string]bool{"type": true}
	for _, name := range g.side("fromClient") {
		s := g.defs[name]
		for _, key := range s.Properties.keys {
			if seen[key] {
				continue
			}
			seen[key] = true
			if err := g.field(key, s.Properties.props[key], false); err != nil {
				return fmt.Errorf("%s: %w", name, err)
			}
		}
	}
	g.out.WriteString("}\n\n")
	return nil
}

// JS writes the play page's table of message types.
func JS(raw []byte) ([]byte, error) {
	g, err := read(raw)
	if err != nil {
		return nil, err
	}
	types := func(side string) string {
		var out []string
		for _, name := range g.side(side) {
			out = append(out, fmt.Sprintf("%q", g.defs[name].Properties.props["type"].Const))
		}
		return strings.Join(out, ", ")
	}
	var b strings.Builder
	fmt.Fprintf(&b, "// %s\n\n", Header)
	fmt.Fprintf(&b, "// The messages the game server sends, by type.\nexport const SERVER_MESSAGES = Object.freeze([%s]);\n\n", types("fromServer"))
	fmt.Fprintf(&b, "// The messages a client sends, by type.\nexport const CLIENT_MESSAGES = Object.freeze([%s]);\n", types("fromClient"))
	return []byte(b.String()), nil
}
