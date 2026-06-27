package command_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// stubPayload is a test CommandPayload with a fixed type string.
type stubPayload struct{ typ string }

func (s stubPayload) CommandType() string { return s.typ }

// stubHandler records all Handle calls for inspection.
type stubHandler struct {
	typ         string
	deduplicate bool
	calls       []stubCall
}

type stubCall struct {
	unitID  uuid.UUID
	payload command.CommandPayload
}

func (h *stubHandler) Type() string      { return h.typ }
func (h *stubHandler) Deduplicate() bool { return h.deduplicate }
func (h *stubHandler) Handle(unitID uuid.UUID, payload command.CommandPayload, _ *instancestate.InstanceState) error {
	h.calls = append(h.calls, stubCall{unitID, payload})
	return nil
}

func cmd(unitID uuid.UUID, typ string, t time.Time) command.Command {
	return command.Command{UnitID: unitID, ReceivedAt: t, Payload: stubPayload{typ}}
}

func emptyState() *instancestate.InstanceState {
	return &instancestate.InstanceState{Units: make(map[uuid.UUID]*instancestate.UnitState)}
}

// --- Basic delegation ---

func TestProcessor_DelegatesToHandler(t *testing.T) {
	p := command.NewCommandProcessor()
	h := &stubHandler{typ: "foo"}
	p.Register(h)

	unitID := uuid.New()
	p.Process([]command.Command{cmd(unitID, "foo", time.Now())}, emptyState())

	assert.Len(t, h.calls, 1)
	assert.Equal(t, unitID, h.calls[0].unitID)
}

func TestProcessor_UnknownTypeIsIgnored(t *testing.T) {
	p := command.NewCommandProcessor()
	assert.NotPanics(t, func() {
		p.Process([]command.Command{cmd(uuid.New(), "unknown", time.Now())}, emptyState())
	})
}

func TestProcessor_Register_PanicsOnDuplicate(t *testing.T) {
	p := command.NewCommandProcessor()
	p.Register(&stubHandler{typ: "foo"})
	assert.Panics(t, func() { p.Register(&stubHandler{typ: "foo"}) })
}

// --- De-duplication ---

func TestProcessor_Dedup_KeepsLastPerUnitPerType(t *testing.T) {
	p := command.NewCommandProcessor()
	h := &stubHandler{typ: "foo", deduplicate: true}
	p.Register(h)

	unitID := uuid.New()
	t0 := time.Now()
	cmds := []command.Command{
		cmd(unitID, "foo", t0),
		cmd(unitID, "foo", t0.Add(time.Millisecond)),
		cmd(unitID, "foo", t0.Add(2*time.Millisecond)),
	}

	p.Process(cmds, emptyState())

	assert.Len(t, h.calls, 1)
	assert.Equal(t, cmds[2].Payload, h.calls[0].payload)
}

func TestProcessor_NoDedup_ProcessesAll(t *testing.T) {
	p := command.NewCommandProcessor()
	h := &stubHandler{typ: "foo", deduplicate: false}
	p.Register(h)

	unitID := uuid.New()
	t0 := time.Now()
	p.Process([]command.Command{
		cmd(unitID, "foo", t0),
		cmd(unitID, "foo", t0.Add(time.Millisecond)),
	}, emptyState())

	assert.Len(t, h.calls, 2)
}

func TestProcessor_Dedup_IsPerUnit(t *testing.T) {
	p := command.NewCommandProcessor()
	h := &stubHandler{typ: "foo", deduplicate: true}
	p.Register(h)

	unitA, unitB := uuid.New(), uuid.New()
	t0 := time.Now()
	p.Process([]command.Command{
		cmd(unitA, "foo", t0),
		cmd(unitB, "foo", t0.Add(time.Millisecond)),
	}, emptyState())

	assert.Len(t, h.calls, 2) // one surviving command per unit
}

func TestProcessor_Dedup_IsPerType(t *testing.T) {
	p := command.NewCommandProcessor()
	hFoo := &stubHandler{typ: "foo", deduplicate: true}
	hBar := &stubHandler{typ: "bar", deduplicate: true}
	p.Register(hFoo)
	p.Register(hBar)

	unitID := uuid.New()
	t0 := time.Now()
	p.Process([]command.Command{
		cmd(unitID, "foo", t0),
		cmd(unitID, "bar", t0.Add(time.Millisecond)),
	}, emptyState())

	assert.Len(t, hFoo.calls, 1)
	assert.Len(t, hBar.calls, 1)
}

// --- MovePayload ---

func TestMovePayload_CommandType(t *testing.T) {
	p := command.MovePayload{Facing: 90.0, Keys: []command.MoveKey{command.MoveKeyForward}}
	assert.Equal(t, "move", p.CommandType())
}
