package game

import (
	"bytes"
	"flag"
	"fmt"
	"os"
	"slices"
	"strings"
	"sync"
	"testing"

	"github.com/delve-mmo/delve3d/game-server/internal/messagesgen"
	"github.com/delve-mmo/delve3d/game-server/internal/messagestest"
)

// TestMain runs the tests while keeping every message the server encodes and every client message
// it takes, then checks each against the protocol's schema. Run in full, it also checks the tests
// send every kind of message the schema has, so each is checked.
func TestMain(m *testing.M) {
	var mu sync.Mutex
	var sent, got [][]byte
	encoded = func(b []byte) { mu.Lock(); sent = append(sent, b); mu.Unlock() }
	handled = func(b []byte) { mu.Lock(); got = append(got, bytes.Clone(b)); mu.Unlock() }
	code := m.Run()
	if code == 0 {
		full := flag.Lookup("test.run").Value.String() == ""
		if problems := checkMessages(sent, got, full); len(problems) > 0 {
			fmt.Fprintf(os.Stderr, "messages that don't match %s:\n  %s\n", messagestest.Path(), strings.Join(problems, "\n  "))
			code = 1
		}
	}
	os.Exit(code)
}

// elsewhere are messages the server package's tests check, as they come and go before a player's
// on a layer.
var elsewhere = []string{"server.pickClass", "server.error", "client.pick"}

func checkMessages(sent, got [][]byte, full bool) []string {
	var problems []string
	seen := map[string]bool{}
	check := func(side string, msgs [][]byte) {
		for _, b := range msgs {
			kind, why := messagestest.Check(side, b)
			seen[kind] = true
			if why != "" && !slices.Contains(problems, why) {
				problems = append(problems, why)
			}
		}
	}
	check("server", sent)
	check("client", got)
	if full {
		kinds, err := messagestest.Kinds()
		if err != nil {
			return []string{err.Error()}
		}
		for _, kind := range kinds {
			if !seen[kind] && !slices.Contains(elsewhere, kind) {
				problems = append(problems, "no test sends "+kind)
			}
		}
	}
	slices.Sort(problems)
	return problems
}

// TestTheProtocolSchemaCompiles reads the schema inside a test, where the test cache sees it, so a
// change to it runs these tests again.
func TestTheProtocolSchemaCompiles(t *testing.T) {
	if _, err := messagestest.Kinds(); err != nil {
		t.Fatal(err)
	}
}

// TestTheGeneratedMessagesAreCurrent fails when the schema has changed since messages_gen.go and
// the play page's messageTypes.js were written.
func TestTheGeneratedMessagesAreCurrent(t *testing.T) {
	raw, err := os.ReadFile(messagestest.Path())
	if err != nil {
		t.Fatal(err)
	}
	want, err := messagesgen.Go(raw)
	if err != nil {
		t.Fatal(err)
	}
	if have, _ := os.ReadFile("messages_gen.go"); !bytes.Equal(have, want) {
		t.Error("messages_gen.go is out of date: run go generate ./internal/game")
	}
}
