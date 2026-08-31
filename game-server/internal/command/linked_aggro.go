package command

import (
	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// aggroLinkedGroupOnKill pulls every idle unit linked to dyingZoneID (see
// instanceconfig.SymmetricLinkGroups) into combat against attackerID. This
// covers a unit killed before it ever got a chance to aggro on its own -
// e.g. a one-shot kill - which would otherwise leave its group unaware.
func aggroLinkedGroupOnKill(dyingZoneID string, attackerID uuid.UUID, zone instanceconfig.Zone, next *instancestate.InstanceState) {
	links := instanceconfig.SymmetricLinkGroups(zone)[dyingZoneID]
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
		u.Behavior.LeashX = u.Position.X
		u.Behavior.LeashY = u.Position.Y
		u.Behavior.LeashMapID = u.MapIdentifier
		id := attackerID
		u.Target = &id
		u.Attacking = true
		u.Status = instancestate.UnitStatusEngaged
	}
}
