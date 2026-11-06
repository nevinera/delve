package schemarefs

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestCompile(t *testing.T) {
	m, err := Compile("testdata", "doc.schema.json")
	if err != nil {
		t.Fatal(err)
	}
	b, _ := json.Marshal(m)
	want := `{"root":{"props":{"byName":{"values":{"ref":"parts.schema.json#/$defs/tag"}},"owner":{"refers":"person"},"parts":{"items":{"ref":"doc.schema.json#/$defs/part"}}},"needs":["owner"]},` +
		`"defs":{"doc.schema.json#/$defs/part":{"what":"A part","props":{"inside":{"ref":"doc.schema.json#/$defs/part"},"maker":{"refers":"person"}}},"parts.schema.json#/$defs/tag":{"props":{"by":{"refers":"person"}}}}}`
	if string(b) != want {
		t.Errorf("got  %s\nwant %s", b, want)
	}
	if got := m.Kinds(); len(got) != 1 || got[0] != "person" {
		t.Errorf("kinds %v", got)
	}
}

func TestOneFieldMeansOneThing(t *testing.T) {
	if _, err := Compile("testdata", "clash.schema.json"); err == nil || !strings.Contains(err.Error(), "both") {
		t.Errorf("err = %v", err)
	}
}
