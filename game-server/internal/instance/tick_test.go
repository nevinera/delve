package instance_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instance"
)

const shortTimeout = 150 * time.Millisecond

func startedInstance(t *testing.T, reg *instance.Registry) *instance.Instance {
	t.Helper()
	inst := makeInstance()
	inst.EmptyTimeout = shortTimeout
	require.NoError(t, inst.Start(reg))
	reg.Add(inst)
	return inst
}

func TestInstance_AutoStops_WhenEmptyLongEnough(t *testing.T) {
	reg := instance.NewRegistry()
	inst := startedInstance(t, reg)

	select {
	case <-inst.Done():
	case <-time.After(2 * time.Second):
		t.Fatal("instance did not auto-stop within deadline")
	}

	assert.Equal(t, instance.StatusStopping, inst.Status)
}

func TestInstance_AutoStop_RemovesFromRegistry(t *testing.T) {
	reg := instance.NewRegistry()
	startedInstance(t, reg)

	deadline := time.After(2 * time.Second)
	for {
		if reg.Count() == 0 {
			break
		}
		select {
		case <-deadline:
			t.Fatal("instance was not removed from registry within deadline")
		case <-time.After(10 * time.Millisecond):
		}
	}
}

func TestInstance_DoesNotAutoStop_WhenSlotPresent(t *testing.T) {
	reg := instance.NewRegistry()
	inst := startedInstance(t, reg)
	t.Cleanup(inst.Stop)

	_, err := inst.AddSlot("Aldric", puncherClass)
	require.NoError(t, err)

	select {
	case <-inst.Done():
		t.Fatal("instance stopped unexpectedly while a slot was present")
	case <-time.After(shortTimeout * 3):
		// still running - correct
	}
}

func TestInstance_ResetsEmptyTimer_WhenSlotAdded(t *testing.T) {
	reg := instance.NewRegistry()
	inst := startedInstance(t, reg)
	t.Cleanup(inst.Stop)

	// Let it get partway through the empty timeout, then add a slot.
	time.Sleep(shortTimeout / 2)
	_, err := inst.AddSlot("Aldric", puncherClass)
	require.NoError(t, err)

	// Should NOT have stopped after the original timeout would have elapsed.
	select {
	case <-inst.Done():
		t.Fatal("instance stopped unexpectedly after slot was added")
	case <-time.After(shortTimeout):
		// still running - correct
	}
}
