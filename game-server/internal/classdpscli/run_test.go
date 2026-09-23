package classdpscli_test

import (
	"bytes"
	"encoding/json"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/classdps"
	"github.com/delve-mmo/game-server/internal/classdpscli"
)

const puncherJSON = `{
	"class": {
		"primaryStats": ["strength"],
		"secondaryStats": ["crit_rating", "haste_rating", "mastery_rating", "versatility_rating", "stamina"],
		"wields": ["dagger", "dagger"]
	},
	"strategy": []
}`

func run(args ...string) (stdout, stderr string, code int) {
	var out, errOut bytes.Buffer
	code = classdpscli.Run(args, &out, &errOut)
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
	_, stderr, code := run("/nonexistent/class.json")
	assert.Equal(t, 1, code)
	assert.Contains(t, stderr, "error reading input")
}

func TestRun_MalformedJSON(t *testing.T) {
	path := writeTempFile(t, "not json")
	_, stderr, code := run(path)
	assert.Equal(t, 1, code)
	assert.Contains(t, stderr, "error parsing input")
}

func TestRun_ValidClassPrintsFullMatrix(t *testing.T) {
	path := writeTempFile(t, puncherJSON)
	stdout, stderr, code := run(path)
	require.Equal(t, 0, code, "stderr: %s", stderr)

	var resp struct {
		Results []classdps.FlatCell `json:"results"`
	}
	require.NoError(t, json.Unmarshal([]byte(stdout), &resp))
	assert.Len(t, resp.Results, len(classdps.Durations)*len(classdps.Elevations))
	for _, cell := range resp.Results {
		assert.Greater(t, cell.DPS, 0.0)
	}
}

func TestRun_ReadsFromStdinWhenPathIsDash(t *testing.T) {
	restore := setStdin(t, puncherJSON)
	defer restore()

	stdout, stderr, code := run("-")
	require.Equal(t, 0, code, "stderr: %s", stderr)

	var resp struct {
		Results []classdps.FlatCell `json:"results"`
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

// setStdin temporarily replaces os.Stdin with a pipe fed content, returning
// a restore func. Needed since classdpscli.Run reads "-" from os.Stdin
// directly (matching the CLI's real invocation), not an injectable reader.
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
