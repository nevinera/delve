package instance

// Exports of internal symbols for use in package-level black-box tests.

import (
	"time"

	"github.com/delve-mmo/game-server/internal/instancestate"
)

func BuildFullStateMsgForTest(state *instancestate.InstanceState, now time.Time, checksum string) ([]byte, error) {
	return buildFullStateMsg(state, now, checksum)
}

func BuildDeltaMsgForTest(prev, curr *instancestate.InstanceState, now time.Time, checksum string) ([]byte, error) {
	return buildDeltaMsg(prev, curr, now, checksum)
}
