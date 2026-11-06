// Command classrefs writes where a class names its statuses, abilities, resources, units and
// specializations, from the "x-refers" marks in docs/schema/class.schema.json and the schemas it
// uses (internal/schemarefs). It writes internal/combat/classrefs.json and the class editor's
// client/src/classes/classRefs.json. Run it with `go generate ./internal/combat` from game-server.
package main

import (
	"fmt"
	"os"

	"github.com/delve-mmo/delve3d/game-server/internal/schemarefs"
)

func main() {
	// go generate runs it in the package's directory; the paths are from game-server's.
	for {
		if _, err := os.Stat("go.mod"); err == nil {
			break
		}
		if wd, _ := os.Getwd(); wd == "/" {
			fail(fmt.Errorf("not in game-server"))
		}
		if err := os.Chdir(".."); err != nil {
			fail(err)
		}
	}
	m, err := schemarefs.Compile("../docs/schema", "class.schema.json")
	if err != nil {
		fail(err)
	}
	out, err := m.JSON()
	if err != nil {
		fail(err)
	}
	for _, path := range []string{"internal/combat/classrefs.json", "../client/src/classes/classRefs.json"} {
		if err := os.WriteFile(path, out, 0o644); err != nil {
			fail(err)
		}
	}
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, "classrefs:", err)
	os.Exit(1)
}
