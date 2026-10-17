package instance

import (
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// ZoneExitLockout is how long after a failed exit a player has to wait
// before an exit will try again, so a player standing near it can't hammer
// Rails.
const ZoneExitLockout = 6 * time.Second

// ZoneExitConfirmWindow is how long after entering the zone stepping onto an
// exit asks the player to confirm first, so walking straight back out is
// deliberate rather than an accident.
const ZoneExitConfirmWindow = 10 * time.Second

// pendingZoneExit is a player who stepped onto an exit this tick; the Rails
// call for it is fired after the tick's broadcast.
type pendingZoneExit struct {
	slotID           uuid.UUID
	unitID           uuid.UUID
	worldCharacterID string
	connection       string // "mapId/connectionId"
	needsConfirm     bool   // inside ZoneExitConfirmWindow: ask the player first
}

type zoneExitResult struct {
	pendingZoneExit
	err error
}

type zoneExitMsg struct {
	downBase
	Connection string `json:"connection"`
}

type zoneExitConfirmMsg struct {
	downBase
	Connection string `json:"connection"`
}

type zoneExitFailedMsg struct {
	downBase
	Error string `json:"error"`
}

func (inst *Instance) exitLockout() time.Duration {
	if inst.ExitLockout != 0 {
		return inst.ExitLockout
	}
	return ZoneExitLockout
}

// armZoneExits starts a freshly spawned unit's confirm window. Tick loop only.
func (inst *Instance) armZoneExits(unitID uuid.UUID, now time.Time) {
	inst.exitConfirmUntil[unitID] = now.Add(ZoneExitConfirmWindow)
}

// lockZoneExits keeps a unit's exits from firing for the lockout. Tick loop only.
func (inst *Instance) lockZoneExits(unitID uuid.UUID, now time.Time) {
	inst.exitArmedAt[unitID] = now.Add(inst.exitLockout())
}

// forgetZoneExits drops a removed unit's exit bookkeeping. Tick loop only.
func (inst *Instance) forgetZoneExits(unitID uuid.UUID) {
	delete(inst.exitArmedAt, unitID)
	delete(inst.exitConfirmUntil, unitID)
	delete(inst.exitAwaiting, unitID)
	delete(inst.exitsInFlight, unitID)
}

// detectZoneExits finds players who stepped onto one of the instance's
// exits this tick. An exit fires only on the tick a player first touches it
// (they weren't touching it in prevState), so spawning onto an exit or
// standing on one never fires it - and only once their lockout has passed
// and no exit of theirs is already in flight. Within ZoneExitConfirmWindow
// of entering, the exit is flagged needsConfirm instead of being sent. Only world-mode slots (which
// have a WorldCharacter for Rails to move) can exit. Tick loop only.
func (inst *Instance) detectZoneExits(state, prevState *instancestate.InstanceState, now time.Time) []pendingZoneExit {
	if len(inst.Exits) == 0 || inst.RailsClient == nil {
		return nil
	}
	connsByMap := buildConnectionsByMap(inst.ZoneConfig)
	var pending []pendingZoneExit
	for unitID, unit := range state.Units {
		if !strings.HasPrefix(unit.ZoneUnitIdentifier, "player:") || unit.Status == instancestate.UnitStatusDead {
			continue
		}
		if inst.exitsInFlight[unitID] || now.Before(inst.exitArmedAt[unitID]) {
			continue
		}
		prevUnit := prevState.Units[unitID]
		if prevUnit == nil {
			continue // just appeared: nothing to have stepped from
		}
		for _, conn := range connsByMap[unit.MapIdentifier] {
			key := unit.MapIdentifier + "/" + conn.Identifier
			if !inst.Exits[key] || !touchingConnection(unit, conn) {
				continue
			}
			if prevUnit.MapIdentifier == unit.MapIdentifier && touchingConnection(prevUnit, conn) {
				continue
			}
			slot := inst.slotByUnitID(unitID)
			if slot == nil || slot.WorldCharacterDatabaseID == "" {
				break
			}
			exit := pendingZoneExit{
				slotID:           slot.ID,
				unitID:           unitID,
				worldCharacterID: slot.WorldCharacterDatabaseID,
				connection:       key,
				needsConfirm:     now.Before(inst.exitConfirmUntil[unitID]),
			}
			if !exit.needsConfirm {
				inst.exitsInFlight[unitID] = true
			}
			pending = append(pending, exit)
			break
		}
	}
	return pending
}

// askZoneExitConfirm asks the player whether they really want to leave, and
// remembers the exit so their "yes" (see takeZoneExitConfirms) can send it.
// Tick loop only.
func (inst *Instance) askZoneExitConfirm(exit pendingZoneExit, now time.Time) {
	inst.exitAwaiting[exit.unitID] = exit
	base := downBase{Direction: "down", Type: "zone-exit-confirm", Timestamp: now.UnixMilli()}
	inst.sendJSONToSlot(exit.slotID, zoneExitConfirmMsg{downBase: base, Connection: exit.connection})
}

// takeZoneExitConfirms pulls the players' "yes, leave" answers out of cmds
// and returns the rest, along with the exits those answers release. An
// answer with no question outstanding is dropped. Tick loop only.
func (inst *Instance) takeZoneExitConfirms(cmds []command.Command) ([]command.Command, []pendingZoneExit) {
	var rest []command.Command
	var confirmed []pendingZoneExit
	for _, cmd := range cmds {
		if _, ok := cmd.Payload.(command.ConfirmZoneExitPayload); !ok {
			rest = append(rest, cmd)
			continue
		}
		exit, waiting := inst.exitAwaiting[cmd.UnitID]
		if !waiting || inst.exitsInFlight[cmd.UnitID] {
			continue
		}
		delete(inst.exitAwaiting, cmd.UnitID)
		inst.exitsInFlight[cmd.UnitID] = true
		confirmed = append(confirmed, exit)
	}
	return rest, confirmed
}

// fireZoneExit tells Rails about one exit and reports back on
// zoneExitResultCh for the tick loop to act on.
func (inst *Instance) fireZoneExit(ctx context.Context, exit pendingZoneExit) {
	err := inst.RailsClient.ZoneExit(exit.worldCharacterID, inst.ZoneIdentifier, exit.connection)
	if err != nil {
		slog.WarnContext(ctx, "zone exit failed", "error", err, "world_character", exit.worldCharacterID, "connection", exit.connection)
	}
	select {
	case inst.zoneExitResultCh <- zoneExitResult{pendingZoneExit: exit, err: err}:
	case <-ctx.Done(): // instance stopped; nobody left to tell
	}
}

// drainZoneExitResults acts on finished Rails exit calls: a successful exit
// tells the player's client and removes their slot (and, next tick, their
// unit); a failed one tells the client why and restarts the lockout so a
// player standing near the exit can't hammer Rails. Tick loop only.
func (inst *Instance) drainZoneExitResults(now time.Time) {
	for {
		select {
		case result := <-inst.zoneExitResultCh:
			base := downBase{Direction: "down", Timestamp: now.UnixMilli()}
			if result.err == nil {
				base.Type = "zone-exit"
				inst.sendJSONToSlot(result.slotID, zoneExitMsg{downBase: base, Connection: result.connection})
				inst.RemoveSlot(result.slotID)
				continue
			}
			base.Type = "zone-exit-failed"
			inst.sendJSONToSlot(result.slotID, zoneExitFailedMsg{downBase: base, Error: result.err.Error()})
			delete(inst.exitsInFlight, result.unitID)
			inst.lockZoneExits(result.unitID, now)
		default:
			return
		}
	}
}

func (inst *Instance) sendJSONToSlot(slotID uuid.UUID, msg any) {
	payload, err := json.Marshal(msg)
	if err != nil {
		slog.Error("failed to encode slot message", "error", err)
		return
	}
	inst.sendToSlot(slotID, payload)
}
