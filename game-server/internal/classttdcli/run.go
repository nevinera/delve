// Package classttdcli implements the class-ttd-sim CLI (issue #135): reads a
// class+strategy JSON document from a file or stdin, runs
// internal/classdps.TTDMatrix, and prints the survivability cells as JSON.
// No HTTP, no Rails - standalone.
package classttdcli

import (
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"os"
	"time"

	"github.com/delve-mmo/game-server/internal/classdps"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

// request is the input document's shape - the same {class, strategy, seed}
// body POST /class-ttd-sim takes, so the same JSON works against either.
type request struct {
	Class    instanceconfig.CharacterClass `json:"class"`
	Strategy classdps.Strategy             `json:"strategy"`
	Seed     *int64                        `json:"seed,omitempty"`     // omitted: a fresh, non-reproducible run
	Extended bool                          `json:"extended,omitempty"` // raise the survival cap to 1200s
}

// Run is the entry point for the class-ttd-sim CLI. It accepts args (the
// non-program portion of os.Args), stdout, and stderr writers, and returns
// an exit code. Factored out of main so it can be tested without exec.
func Run(args []string, stdout, stderr io.Writer) int {
	if len(args) != 1 {
		_, _ = fmt.Fprintln(stderr, "usage: class-ttd-sim <path|->")
		return 1
	}

	data, err := readInput(args[0])
	if err != nil {
		_, _ = fmt.Fprintf(stderr, "error reading input: %v\n", err)
		return 1
	}

	var req request
	if err := json.Unmarshal(data, &req); err != nil {
		_, _ = fmt.Fprintf(stderr, "error parsing input: %v\n", err)
		return 1
	}

	seed := time.Now().UnixNano()
	if req.Seed != nil {
		seed = *req.Seed
	}
	rng := rand.New(rand.NewSource(seed))

	cells := classdps.TTDMatrix(req.Class, req.Strategy, req.Extended, rng)
	out, err := json.MarshalIndent(map[string]any{"results": cells}, "", "  ")
	if err != nil {
		_, _ = fmt.Fprintf(stderr, "error encoding output: %v\n", err)
		return 1
	}

	_, _ = fmt.Fprintln(stdout, string(out))
	return 0
}

func readInput(path string) ([]byte, error) {
	if path == "-" {
		return io.ReadAll(os.Stdin)
	}
	return os.ReadFile(path)
}
