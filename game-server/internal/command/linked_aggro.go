package command

import (
	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// EngageOnAttack reacts to unitID attacking target: an idle hostile target
// immediately notices and engages attackerID, regardless of whether
// attackerID is within its own aggro radius - and regardless of whether the
// attack actually lands, since noticing you swung at it doesn't require the
// swing to connect. Call this before rolling miss/avoidance/damage, not
// after, so a miss still aggros (some units may later get exceptions to
// this). Also pulls in any idle units linked to target, same as a kill
// would, in case this attack is the killing blow.
func EngageOnAttack(target *instancestate.UnitState, attackerID uuid.UUID, zone instanceconfig.Zone, next *instancestate.InstanceState) {
	if target.Status == instancestate.UnitStatusIdle && target.Hostility == "hostile" {
		engageIdleUnit(target, attackerID)
	}
	aggroLinkedGroup(target.ZoneUnitIdentifier, attackerID, zone, next)
}

// aggroLinkedGroup pulls every idle unit linked to zoneID (see
// instanceconfig.SymmetricLinkGroups) into combat against attackerID.
func aggroLinkedGroup(zoneID string, attackerID uuid.UUID, zone instanceconfig.Zone, next *instancestate.InstanceState) {
	links := instanceconfig.SymmetricLinkGroups(zone)[zoneID]
	if len(links) == 0 {
		return
	}
	linkSet := make(map[string]struct{}, len(links))
	for _, l := range links {
		linkSet[l] = struct{}{}
	}
	for _, u := range next.Units {
		if _, ok := linkSet[u.ZoneUnitIdentifier]; !ok || u.Status != instancestate.UnitStatusIdle {
			continue
		}
		engageIdleUnit(u, attackerID)
	}
}

// engageIdleUnit transitions an idle unit into combat against attackerID,
// recording its current position as the leash point (mirrors
// instance.engageUnit's idle->engaged transition).
func engageIdleUnit(u *instancestate.UnitState, attackerID uuid.UUID) {
	u.Behavior.LeashX = u.Position.X
	u.Behavior.LeashY = u.Position.Y
	u.Behavior.LeashMapID = u.MapIdentifier
	id := attackerID
	u.Target = &id
	u.Attacking = true
	u.Status = instancestate.UnitStatusEngaged
}
