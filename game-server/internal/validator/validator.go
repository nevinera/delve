package validator

import (
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

// Run is the entry point for the validate-zone CLI. It accepts args (the
// non-program portion of os.Args), stdout, and stderr writers, and returns
// an exit code. Factored out of main so it can be tested without exec.
func Run(args []string, stdout, stderr io.Writer) int {
	if len(args) != 1 {
		fmt.Fprintln(stderr, "usage: validate-zone <path>")
		return 1
	}

	data, err := os.ReadFile(args[0])
	if err != nil {
		fmt.Fprintf(stderr, "error reading file: %v\n", err)
		return 1
	}

	var zone instanceconfig.Zone
	if err := json.Unmarshal(data, &zone); err != nil {
		fmt.Fprintf(stderr, "error parsing zone config: %v\n", err)
		return 1
	}

	unitCount := 0
	// identifier → first map it was seen in
	seen := make(map[string]string)
	var duplicates []string
	for _, m := range zone.Maps {
		unitCount += len(m.Units)
		for _, u := range m.Units {
			if u.Identifier == "" {
				continue
			}
			if first, ok := seen[u.Identifier]; ok {
				duplicates = append(duplicates, fmt.Sprintf("%q (in %s and %s)", u.Identifier, first, m.Identifier))
			} else {
				seen[u.Identifier] = m.Identifier
			}
		}
	}

	if len(duplicates) > 0 {
		for _, d := range duplicates {
			fmt.Fprintf(stderr, "duplicate unit identifier: %s\n", d)
		}
		return 1
	}

	fmt.Fprintf(stdout, "Zone:         %s\n", zone.Name)
	fmt.Fprintf(stdout, "  Private:    %v\n", zone.Private)
	fmt.Fprintf(stdout, "  Maps:       %d\n", len(zone.Maps))
	fmt.Fprintf(stdout, "  Unit types: %d\n", len(zone.UnitTypes))
	fmt.Fprintf(stdout, "  Units:      %d\n", unitCount)
	fmt.Fprintf(stdout, "  Zone links: %d\n", len(zone.ZoneLinks))
	fmt.Fprintf(stdout, "  Entry points: %d\n", len(zone.EntryPoints))
	return 0
}
