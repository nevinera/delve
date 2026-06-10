package instance_test

import (
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

var puncherClass = instanceconfig.CharacterClass{
	Name:   "Puncher",
	Colors: instanceconfig.Colors{Major: "8B4513", Minor: "F4A460"},
}

func TestAddSlot_ReturnsSlotWithIDs(t *testing.T) {
	inst := makeInstance()
	slot, err := inst.AddSlot("Aldric", puncherClass)
	require.NoError(t, err)

	assert.NotEqual(t, uuid.Nil, slot.ID)
	assert.NotEqual(t, uuid.Nil, slot.Token)
	assert.NotEqual(t, slot.ID, slot.Token)
	assert.Equal(t, instance.SlotStatePending, slot.State)
	assert.Equal(t, "Aldric", slot.CharacterName)
	assert.Equal(t, "Puncher", slot.CharacterClass.Name)
}

func TestAddSlot_AppearsInList(t *testing.T) {
	inst := makeInstance()
	slot, err := inst.AddSlot("Aldric", puncherClass)
	require.NoError(t, err)

	list := inst.ListSlots()
	require.Len(t, list, 1)
	assert.Equal(t, slot.ID, list[0].ID)
}

func TestAddSlot_ErrInstanceFull(t *testing.T) {
	inst := makeInstance()
	inst.MaxSlots = 2

	_, err := inst.AddSlot("Char1", puncherClass)
	require.NoError(t, err)
	_, err = inst.AddSlot("Char2", puncherClass)
	require.NoError(t, err)

	_, err = inst.AddSlot("Char3", puncherClass)
	assert.ErrorIs(t, err, instance.ErrInstanceFull)
}

func TestGetSlot_Found(t *testing.T) {
	inst := makeInstance()
	added, err := inst.AddSlot("Aldric", puncherClass)
	require.NoError(t, err)

	got, ok := inst.GetSlot(added.ID)
	require.True(t, ok)
	assert.Equal(t, added.ID, got.ID)
}

func TestGetSlot_NotFound(t *testing.T) {
	inst := makeInstance()
	_, ok := inst.GetSlot(uuid.New())
	assert.False(t, ok)
}

func TestRemoveSlot_RemovesFromList(t *testing.T) {
	inst := makeInstance()
	slot, err := inst.AddSlot("Aldric", puncherClass)
	require.NoError(t, err)

	removed := inst.RemoveSlot(slot.ID)
	assert.True(t, removed)
	assert.Empty(t, inst.ListSlots())
}

func TestRemoveSlot_MissingReturnsFalse(t *testing.T) {
	inst := makeInstance()
	assert.False(t, inst.RemoveSlot(uuid.New()))
}

func TestAddSlot_UniqueIDsAndTokens(t *testing.T) {
	inst := makeInstance()
	a, err := inst.AddSlot("A", puncherClass)
	require.NoError(t, err)
	b, err := inst.AddSlot("B", puncherClass)
	require.NoError(t, err)

	assert.NotEqual(t, a.ID, b.ID)
	assert.NotEqual(t, a.Token, b.Token)
}

func TestSetSlotState_TransitionsState(t *testing.T) {
	inst := makeInstance()
	slot, err := inst.AddSlot("Aldric", puncherClass)
	require.NoError(t, err)
	assert.Equal(t, instance.SlotStatePending, slot.State)

	ok := inst.SetSlotState(slot.ID, instance.SlotStateConnected)
	assert.True(t, ok)
	assert.Equal(t, instance.SlotStateConnected, slot.State)
}

func TestSetSlotState_NotFound(t *testing.T) {
	inst := makeInstance()
	assert.False(t, inst.SetSlotState(uuid.New(), instance.SlotStateConnected))
}

func TestSlotCounts_Empty(t *testing.T) {
	inst := makeInstance()
	total, active := inst.SlotCounts()
	assert.Equal(t, 0, total)
	assert.Equal(t, 0, active)
}

func TestSlotCounts_NoConnected(t *testing.T) {
	inst := makeInstance()
	_, err := inst.AddSlot("Aldric", puncherClass)
	require.NoError(t, err)
	_, err = inst.AddSlot("Brego", puncherClass)
	require.NoError(t, err)

	total, active := inst.SlotCounts()
	assert.Equal(t, 2, total)
	assert.Equal(t, 0, active)
}

func TestSlotCounts_SomeConnected(t *testing.T) {
	inst := makeInstance()
	a, err := inst.AddSlot("Aldric", puncherClass)
	require.NoError(t, err)
	_, err = inst.AddSlot("Brego", puncherClass)
	require.NoError(t, err)

	inst.SetSlotState(a.ID, instance.SlotStateConnected)

	total, active := inst.SlotCounts()
	assert.Equal(t, 2, total)
	assert.Equal(t, 1, active)
}

func TestSlots_ConcurrentAccess(t *testing.T) {
	inst := makeInstance()
	var wg sync.WaitGroup

	for range 50 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			slot, err := inst.AddSlot("X", puncherClass)
			if err != nil {
				return
			}
			inst.GetSlot(slot.ID)
			inst.ListSlots()
			inst.RemoveSlot(slot.ID)
		}()
	}

	wg.Wait()
}
