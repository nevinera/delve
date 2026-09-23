package unitdpscli_test

import (
	"bytes"
	"encoding/json"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/unitdpscli"
)

const goblinJSON = `{
	"enemy": {
		"name": "Cave Goblin",
		"tokenRadius": 2.0,
		"maxHP": 100,
		"dps": 10.0,
		"attackSpeed": 1.0,
		"resource": {"name": "none", "max": 0, "defaultValue": 0, "isFluid": false}
	},
	"durationSeconds": 30,
	"seed": 1
}`

func run(args ...string) (stdout, stderr string, code int) {
	var out, errOut bytes.Buffer
	code = unitdpscli.Run(args, &out, &errOut)
	return out.String(), errOut.String(), code
}

func TestRun_NoArguments(t *testing.T) {
	_, stderr, code := run()
	assert.Equal(t, 1, code)
	assert.Contains(t, stderr, "usage:")
}

func TestRun_TooManyArguments(t *testing.T) {
	_, stderr, code := run("a", "b")
	assert.Equal(t, 1, code)
	assert.Contains(t, stderr, "usage:")
}

func TestRun_FileNotFound(t *testing.T) {
	_, stderr, code := run("/nonexistent/enemy.json")
	assert.Equal(t, 1, code)
	assert.Contains(t, stderr, "error reading input")
}

func TestRun_MalformedJSON(t *testing.T) {
	path := writeTempFile(t, "not json")
	_, stderr, code := run(path)
	assert.Equal(t, 1, code)
	assert.Contains(t, stderr, "error parsing input")
}

func TestRun_ValidEnemyPrintsNineCells(t *testing.T) {
	path := writeTempFile(t, goblinJSON)
	stdout, stderr, code := run(path)
	require.Equal(t, 0, code, "stderr: %s", stderr)

	var resp struct {
		Results []map[string]any `json:"results"`
	}
	require.NoError(t, json.Unmarshal([]byte(stdout), &resp))
	assert.Len(t, resp.Results, 9) // 3 GearingPlans x 3 Elevations
	for _, cell := range resp.Results {
		assert.Greater(t, cell["dps"], 0.0)
	}
}

func TestRun_SameSeedIsDeterministic(t *testing.T) {
	path := writeTempFile(t, goblinJSON)
	stdout1, _, code1 := run(path)
	stdout2, _, code2 := run(path)
	require.Equal(t, 0, code1)
	require.Equal(t, 0, code2)
	assert.Equal(t, stdout1, stdout2)
}

func TestRun_ReadsFromStdinWhenPathIsDash(t *testing.T) {
	restore := setStdin(t, goblinJSON)
	defer restore()

	stdout, stderr, code := run("-")
	require.Equal(t, 0, code, "stderr: %s", stderr)

	var resp struct {
		Results []map[string]any `json:"results"`
	}
	require.NoError(t, json.Unmarshal([]byte(stdout), &resp))
	assert.NotEmpty(t, resp.Results)
}

func writeTempFile(t *testing.T, content string) string {
	t.Helper()
	path := t.TempDir() + "/input.json"
	require.NoError(t, os.WriteFile(path, []byte(content), 0o600))
	return path
}

func setStdin(t *testing.T, content string) (restore func()) {
	t.Helper()
	r, w, err := os.Pipe()
	require.NoError(t, err)

	orig := os.Stdin
	os.Stdin = r

	_, err = w.WriteString(content)
	require.NoError(t, err)
	require.NoError(t, w.Close())

	return func() { os.Stdin = orig }
}
