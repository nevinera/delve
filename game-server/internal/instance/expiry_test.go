package instance_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// connectedSlot adds and connects a slot, returning its message channel.
func connectedSlot(t *testing.T, inst *instance.Instance, name string) (*instance.InstanceSlot, chan []byte) {
	t.Helper()
	slot, err := inst.AddSlot(name, "42", puncherClass, nil, nil)
	require.NoError(t, err)
	writeCh, _, done, ok := inst.ConnectSlot(slot.ID)
	require.True(t, ok)
	t.Cleanup(func() { close(done) })
	return slot, writeCh
}

func assertNoMsg(t *testing.T, ch chan []byte) {
	t.Helper()
	select {
	case raw := <-ch:
		t.Fatalf("unexpected message: %s", raw)
	default:
	}
}

func TestTickExpiry_NothingWithoutAnExpiry(t *testing.T) {
	inst := makeInstance()
	_, writeCh := connectedSlot(t, inst, "Aldric")
	assert.False(t, inst.TickExpiryForTest(time.Now()))
	assertNoMsg(t, writeCh)
}

func TestTickExpiry_WarnsOncePerMinuteInTheLastTen(t *testing.T) {
	inst := makeInstance()
	_, writeCh := connectedSlot(t, inst, "Aldric")
	now := time.Now()
	exp := now.Add(12 * time.Minute)
	inst.SetExpiresAt(exp)

	inst.TickExpiryForTest(now) // 12 minutes out: too early
	assertNoMsg(t, writeCh)

	inst.TickExpiryForTest(exp.Add(-10 * time.Minute))
	msg := readMsgOfType(t, writeCh, "version-expiring")
	assert.Equal(t, 10.0, msg["minutes_remaining"])
	assert.Equal(t, float64(exp.UnixMilli()), msg["expires_at"])

	inst.TickExpiryForTest(exp.Add(-9*time.Minute - 30*time.Second)) // still "10"
	assertNoMsg(t, writeCh)

	inst.TickExpiryForTest(exp.Add(-9 * time.Minute))
	assert.Equal(t, 9.0, readMsgOfType(t, writeCh, "version-expiring")["minutes_remaining"])

	inst.TickExpiryForTest(exp.Add(-time.Second))
	assert.Equal(t, 1.0, readMsgOfType(t, writeCh, "version-expiring")["minutes_remaining"])
}

func TestTickExpiry_AtExpiryTellsEveryoneAndRemovesSlots(t *testing.T) {
	inst := makeInstance()
	a, chA := connectedSlot(t, inst, "Aldric")
	b, chB := connectedSlot(t, inst, "Brego")
	now := time.Now()
	inst.SetExpiresAt(now)

	assert.True(t, inst.TickExpiryForTest(now))

	readMsgOfType(t, chA, "version-expired")
	readMsgOfType(t, chB, "version-expired")
	for _, id := range []uuid.UUID{a.ID, b.ID} {
		_, ok := inst.GetSlot(id)
		assert.False(t, ok)
	}
}

func TestInstance_StopsAtExpiry(t *testing.T) {
	inst := makeInstance()
	require.NoError(t, inst.Start(nil))
	t.Cleanup(inst.Stop)
	_, writeCh := connectedSlot(t, inst, "Aldric")
	inst.SetExpiresAt(time.Now().Add(300 * time.Millisecond))

	sawWarning := false
	deadline := time.After(2 * time.Second)
	for {
		select {
		case raw := <-writeCh:
			var msg map[string]any
			require.NoError(t, json.Unmarshal(raw, &msg))
			if msg["type"] == "version-expiring" {
				sawWarning = true
			}
			if msg["type"] == "version-expired" {
				assert.True(t, sawWarning, "expected a warning before expiry")
				select {
				case <-inst.Done():
				case <-time.After(time.Second):
					t.Fatal("instance didn't stop after expiry")
				}
				return
			}
		case <-deadline:
			t.Fatal("never got version-expired")
		}
	}
}

func TestSelection_SkipsExpiredInstances(t *testing.T) {
	expired := makeKeyedInstance(t, instance.ModeWorld, "world:1", 10)
	expired.SetExpiresAt(time.Now().Add(-time.Second))
	assert.Nil(t, instance.SelectKeyedInstance([]*instance.Instance{expired}, instance.ModeWorld, "world:1"))

	expiring := makeKeyedInstance(t, instance.ModeWorld, "world:1", 10)
	expiring.SetExpiresAt(time.Now().Add(time.Hour))
	assert.Same(t, expiring, instance.SelectKeyedInstance([]*instance.Instance{expired, expiring}, instance.ModeWorld, "world:1"))
}

func TestFullStateMsg_IncludesExpiresAtWhenSet(t *testing.T) {
	state := &instancestate.InstanceState{Units: map[uuid.UUID]*instancestate.UnitState{}}
	exp := time.Now().Add(time.Hour)

	raw, err := instance.BuildFullStateMsgWithExpiryForTest(state, time.Now(), exp)
	require.NoError(t, err)
	var msg map[string]any
	require.NoError(t, json.Unmarshal(raw, &msg))
	assert.Equal(t, float64(exp.UnixMilli()), msg["expires_at"])

	raw, err = instance.BuildFullStateMsgWithExpiryForTest(state, time.Now(), time.Time{})
	require.NoError(t, err)
	msg = map[string]any{}
	require.NoError(t, json.Unmarshal(raw, &msg))
	assert.NotContains(t, msg, "expires_at")
}
