package validator_test

import (
	"bytes"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/delve-mmo/game-server/internal/validator"
)

const fixtureDir = "../instanceconfig/testdata/"

func run(args ...string) (stdout, stderr string, code int) {
	var out, errOut bytes.Buffer
	code = validator.Run(args, &out, &errOut)
	return out.String(), errOut.String(), code
}

func TestRun(t *testing.T) {
	tests := []struct {
		name       string
		args       []string
		wantCode   int
		wantOut    string
		wantErr    string
	}{
		{
			name:     "no arguments",
			args:     nil,
			wantCode: 1,
			wantErr:  "usage:",
		},
		{
			name:     "too many arguments",
			args:     []string{"a", "b"},
			wantCode: 1,
			wantErr:  "usage:",
		},
		{
			name:     "valid full config",
			args:     []string{fixtureDir + "valid_full.json"},
			wantCode: 0,
			wantOut:  "Goblin Cave",
		},
		{
			name:     "valid full config shows map count",
			args:     []string{fixtureDir + "valid_full.json"},
			wantCode: 0,
			wantOut:  "Maps:       2",
		},
		{
			name:     "valid full config shows unit type count",
			args:     []string{fixtureDir + "valid_full.json"},
			wantCode: 0,
			wantOut:  "Unit types: 1",
		},
		{
			name:     "valid minimal config",
			args:     []string{fixtureDir + "valid_minimal.json"},
			wantCode: 0,
			wantOut:  "Empty Room",
		},
		{
			name:     "unknown keys are ignored",
			args:     []string{fixtureDir + "unknown_keys.json"},
			wantCode: 0,
			wantOut:  "Room With Extra Fields",
		},
		{
			name:     "malformed JSON exits nonzero",
			args:     []string{fixtureDir + "malformed.json"},
			wantCode: 1,
			wantErr:  "error parsing zone config",
		},
		{
			name:     "asset reference exits nonzero with clear message",
			args:     []string{fixtureDir + "asset_reference.json"},
			wantCode: 1,
			wantErr:  "$ref",
		},
		{
			name:     "file not found exits nonzero",
			args:     []string{"/nonexistent/zone.json"},
			wantCode: 1,
			wantErr:  "error reading file",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			stdout, stderr, code := run(tt.args...)
			assert.Equal(t, tt.wantCode, code)
			if tt.wantOut != "" {
				assert.Contains(t, stdout, tt.wantOut)
			}
			if tt.wantErr != "" {
				assert.Contains(t, stderr, tt.wantErr)
			}
		})
	}
}
