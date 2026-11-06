// Package messagestest checks game messages against the protocol's schema,
// docs/schema/messages.schema.json, for tests.
package messagestest

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"sync"

	"github.com/santhosh-tekuri/jsonschema/v6"
)

var (
	once    sync.Once
	schemas map[string]*jsonschema.Schema // by "server.<type>" or "client.<type>"
	failed  error
)

// Path is where the schema is.
func Path() string {
	_, here, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(here), "../../../docs/schema/messages.schema.json")
}

func load() {
	raw, err := os.ReadFile(Path())
	if err != nil {
		failed = err
		return
	}
	var doc struct {
		Defs map[string]json.RawMessage `json:"$defs"`
	}
	if failed = json.Unmarshal(raw, &doc); failed != nil {
		return
	}
	c := jsonschema.NewCompiler()
	schemas = map[string]*jsonschema.Schema{}
	for name := range doc.Defs {
		if !strings.HasPrefix(name, "server.") && !strings.HasPrefix(name, "client.") {
			continue
		}
		if schemas[name], failed = c.Compile(Path() + "#/$defs/" + name); failed != nil {
			return
		}
	}
}

// Kinds is every message the schema has, as "server.<type>" or "client.<type>".
func Kinds() ([]string, error) {
	once.Do(load)
	if failed != nil {
		return nil, failed
	}
	var kinds []string
	for k := range schemas {
		kinds = append(kinds, k)
	}
	slices.Sort(kinds)
	return kinds, nil
}

// Check says how a message from side ("server" or "client") differs from the schema, or "" if it
// matches. kind is "<side>.<type>".
func Check(side string, b []byte) (kind, problem string) {
	once.Do(load)
	var head struct{ Type string }
	_ = json.Unmarshal(b, &head)
	kind = side + "." + head.Type
	if failed != nil {
		return kind, failed.Error()
	}
	s := schemas[kind]
	if s == nil {
		return kind, fmt.Sprintf("%s isn't in the schema: %s", kind, b)
	}
	v, err := jsonschema.UnmarshalJSON(bytes.NewReader(b))
	if err != nil {
		return kind, fmt.Sprintf("%s isn't JSON: %v", kind, err)
	}
	if err := s.Validate(v); err != nil {
		var detail []string
		for _, line := range strings.Split(err.Error(), "\n")[1:] {
			detail = append(detail, strings.TrimSpace(line))
		}
		return kind, fmt.Sprintf("%s %s: %s", kind, b, strings.Join(detail, "; "))
	}
	return kind, ""
}
