package command_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

func castingUnitForPushback() (*instancestate.UnitState, time.Time) {
	endsAt := time.Now().Add(2 * time.Second)
	unit := &instancestate.UnitState{
		Casting: &instancestate.CastState{
			Power:     instanceconfig.Power{Name: "Fireball"},
			StartedAt: time.Now(),
			EndsAt:    endsAt,
		},
	}
	return unit, endsAt
}

func TestApplyCastPushback_NoOpWhenNotCasting(t *testing.T) {
	unit := &instancestate.UnitState{}
	command.ApplyCastPushback(unit)
	assert.Nil(t, unit.Casting)
}

func TestApplyCastPushback_FirstHitExtendsByHalfSecond(t *testing.T) {
	unit, endsAt := castingUnitForPushback()

	command.ApplyCastPushback(unit)

	assert.WithinDuration(t, endsAt.Add(500*time.Millisecond), unit.Casting.EndsAt, time.Millisecond)
	assert.Equal(t, 1, unit.Casting.PushbackHits)
}

func TestApplyCastPushback_SecondHitIsHalfOfTheFirst(t *testing.T) {
	unit, endsAt := castingUnitForPushback()

	command.ApplyCastPushback(unit)
	command.ApplyCastPushback(unit)

	assert.WithinDuration(t, endsAt.Add(750*time.Millisecond), unit.Casting.EndsAt, time.Millisecond)
	assert.Equal(t, 2, unit.Casting.PushbackHits)
}

func TestApplyCastPushback_ThirdHitIsHalfOfTheSecond(t *testing.T) {
	unit, endsAt := castingUnitForPushback()

	command.ApplyCastPushback(unit)
	command.ApplyCastPushback(unit)
	command.ApplyCastPushback(unit)

	assert.WithinDuration(t, endsAt.Add(875*time.Millisecond), unit.Casting.EndsAt, time.Millisecond)
	assert.Equal(t, 3, unit.Casting.PushbackHits)
}

func TestApplyCastPushback_ManyHitsStayUnderOneSecondTotal(t *testing.T) {
	unit, endsAt := castingUnitForPushback()

	for i := 0; i < 20; i++ {
		command.ApplyCastPushback(unit)
	}

	assert.Less(t, unit.Casting.EndsAt.Sub(endsAt), time.Second)
	assert.Equal(t, 20, unit.Casting.PushbackHits)
}
