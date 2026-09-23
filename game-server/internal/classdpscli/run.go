// Package classdpscli implements the class-dps-sim CLI's logic (issue #75's
// "Claude runs parametrized sims for balancing work" requirement) - reads a
// class+strategy JSON document from a file or stdin, runs
// internal/classdps.Matrix, and prints the resulting (duration x
// elevation) matrix as JSON. No HTTP, no Rails - standalone.
package classdpscli

import (
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/delve-mmo/game-server/internal/classdps"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

// request is the input document's shape - the same {class, strategy} body
// POST /class-dps-sim takes, so the same JSON works against either.
type request struct {
	Class    instanceconfig.CharacterClass `json:"class"`
	Strategy classdps.Strategy             `json:"strategy"`
}

// Run is the entry point for the class-dps-sim CLI. It accepts args (the
// non-program portion of os.Args), stdout, and stderr writers, and returns
// an exit code. Factored out of main so it can be tested without exec.
func Run(args []string, stdout, stderr io.Writer) int {
	if len(args) != 1 {
		_, _ = fmt.Fprintln(stderr, "usage: class-dps-sim <path|->")
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

	rows := classdps.Matrix(req.Class, req.Strategy)
	out, err := json.MarshalIndent(map[string]any{"results": classdps.Flatten(rows)}, "", "  ")
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
