// Command messages writes internal/game/messages_gen.go and the play page's
// client/src/play/messageTypes.js from docs/schema/messages.schema.json (internal/messagesgen).
// Run it with `go generate ./internal/game` from game-server.
package main

import (
	"fmt"
	"os"

	"github.com/delve-mmo/delve3d/game-server/internal/messagesgen"
)

func main() {
	// go generate runs it in the package's directory; the paths are from game-server's.
	for {
		if _, err := os.Stat("go.mod"); err == nil {
			break
		}
		if err := os.Chdir(".."); err != nil {
			fail(err)
		}
		if wd, _ := os.Getwd(); wd == "/" {
			fail(fmt.Errorf("not in game-server"))
		}
	}
	raw, err := os.ReadFile("../docs/schema/messages.schema.json")
	if err != nil {
		fail(err)
	}
	for path, write := range map[string]func([]byte) ([]byte, error){
		"internal/game/messages_gen.go":      messagesgen.Go,
		"../client/src/play/messageTypes.js": messagesgen.JS,
	} {
		out, err := write(raw)
		if err != nil {
			fail(err)
		}
		if err := os.WriteFile(path, out, 0o644); err != nil {
			fail(err)
		}
	}
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, "messages:", err)
	os.Exit(1)
}
