package classdps

import (
	"math/rand"
	"runtime"
	"sync"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

// This file is the time-to-die calculator (issue #135): the class fights
// reference enemies built from docs/combat_balance.md (and mirrored in
// client/src/balanceTargets.js - keep the three in step), to check its
// survivability against the doc's targets.

// Reference character the enemy stats are sized against: a squishy
// character at ee = 0 deals squishyDPS and has squishyEHP.
const (
	squishyDPS = 25.0
	squishyEHP = 500.0
)

// intendedFor is a solo-pull enemy's TTK (seconds, for a squishy) and HP
// lost (fraction of a squishy's EHP) at ee = 0.
type intendedFor struct{ ttk, hpLost float64 }

var intendedForTargets = map[string]intendedFor{
	"open": {12, 0.2},
	"g1":   {30, 0.65},
}

// IntendedFor lists the audience tags the sim runs, in stable order.
var IntendedFor = []string{"open", "g1"}

// pullShape is a pull size's unit count (the sim picks one count within the
// doc's range) and its whole-pull TTK and HP-lost multipliers.
type pullShape struct {
	n    int
	t, l float64
}

var pullShapes = map[string]pullShape{
	"solo":  {1, 1.0, 1.0},
	"pair":  {2, 1.3, 1.2},
	"group": {4, 1.6, 1.4},
	"swarm": {6, 1.9, 1.6},
}

// Pulls lists the pull sizes the sim runs, in stable order.
var Pulls = []string{"solo", "pair", "group", "swarm"}

// Schools lists the attack schools the sim runs.
var Schools = []string{"physical", "magic"}

// TTDElevations are the elevations the time-to-die sim runs; the doc has no
// targets above ee = 0.
var TTDElevations = []int{0, -5, -10}

// TTDCaps are the longest a character is left to survive. The last is the
// extended run, dropped unless asked for.
var TTDCaps = []float64{60, 300, 1200}

func ttdCap(extended bool) float64 {
	if extended {
		return TTDCaps[len(TTDCaps)-1]
	}
	return TTDCaps[len(TTDCaps)-2]
}

// referencePull sizes the pull's units from the doc's formulas:
//
//	unit HP      = solo HP  * pullTTK / n
//	unit net DPS = solo DPS * pullHPLost / (pullTTK * (n + 1) / 2)
//
// with solo HP = 25 * TTK and solo DPS = 500 * HP lost / TTK. Enemies don't
// scale with elevation, so the same pull is used at every ee.
func referencePull(audience, size, school string) *pull {
	target := intendedForTargets[audience]
	shape := pullShapes[size]
	n := float64(shape.n)
	hp := squishyDPS * target.ttk * shape.t / n
	dps := (squishyEHP * target.hpLost / target.ttk) * shape.l / (shape.t * (n + 1) / 2)
	units := make([]enemyUnit, shape.n)
	for i := range units {
		units[i] = enemyUnit{HP: hp, RawDPS: dps, Physical: school != "magic"}
	}
	return &pull{Units: units}
}

// TTDCell is one (priority x audience x pull x school x ee) outcome.
type TTDCell struct {
	Priority    string `json:"priority"`
	IntendedFor string `json:"intendedFor"`
	Pull        string `json:"pull"`
	School      string `json:"school"`
	Elevation   int    `json:"elevation"`

	// The fight: the character kills the pull. HPLostPct >= 100 means it died.
	// FightSeconds is the pull's time-to-kill (the cap if Cleared is false).
	HPLostPct    float64 `json:"hpLostPct"`
	FightSeconds float64 `json:"fightSeconds"`
	Cleared      bool    `json:"cleared"`
	Died         bool    `json:"died"`

	// The endurance run: the enemies never die. TTD is how long the
	// character lasts, or the cap when Survives.
	TTD        float64 `json:"ttd"`
	Survives   bool    `json:"survives"`
	CapSeconds float64 `json:"capSeconds"`
}

// ttdTickInterval is coarser than Simulate's 10ms: this runs ~200 cells,
// each potentially minutes long, and the 50ms step's cast-timing error
// (a cast can start up to one step after its GCD ends) is small next to the
// 1.5s global cooldown. Mitigation and avoidance rolls don't depend on it.
// ttdStatsRecalc trades status-expiry precision (<=0.25s) for sim speed.
const ttdStatsRecalc = 0.25

const ttdTickInterval = 0.05

// priorities returns the class's named gearings, or one unnamed default
// when it lists none (only possible for a class that skipped validation).
func priorities(class instanceconfig.CharacterClass) []instanceconfig.StatPriority {
	if len(class.StatPriorities) > 0 {
		return class.StatPriorities
	}
	return []instanceconfig.StatPriority{{Name: "default"}}
}

// TTDMatrix runs the fight and the endurance run for every cell, for each of
// the class's stat priorities. The endurance cap is 300s, or 1200s when
// extended.
func TTDMatrix(class instanceconfig.CharacterClass, strategy Strategy, extended bool, rng *rand.Rand) []TTDCell {
	capSeconds := ttdCap(extended)
	type job struct {
		cfg                          AttackerConfig
		priority, audience, size, sc string
		ee                           int
		seed                         int64
	}
	var jobs []job
	for _, priority := range priorities(class) {
		for _, audience := range IntendedFor {
			for _, size := range Pulls {
				for _, school := range Schools {
					for _, ee := range TTDElevations {
						cfg := AttackerConfig{Class: class, EquippedItems: newTraineeGear(class, priority, ee)}
						jobs = append(jobs, job{cfg, priority.Name, audience, size, school, ee, rng.Int63()})
					}
				}
			}
		}
	}

	cells := make([]TTDCell, len(jobs))
	next := make(chan int)
	var wg sync.WaitGroup
	for w := 0; w < runtime.NumCPU(); w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := range next {
				j := jobs[i]
				cells[i] = ttdCell(j.cfg, strategy, j.priority, j.audience, j.size, j.sc, j.ee, capSeconds, rand.New(rand.NewSource(j.seed)))
			}
		}()
	}
	for i := range jobs {
		next <- i
	}
	close(next)
	wg.Wait()
	return cells
}

func ttdCell(cfg AttackerConfig, strategy Strategy, priority, audience, size, school string, ee int, capSeconds float64, rng *rand.Rand) TTDCell {
	fc := fightConfig{tickInterval: ttdTickInterval, statsRecalc: ttdStatsRecalc, pull: referencePull(audience, size, school)}
	fight := runFight(cfg, strategy, capSeconds, rng, fc)

	fc.pull.Immortal = true
	endurance := runFight(cfg, strategy, capSeconds, rng, fc)

	return TTDCell{
		Priority: priority, IntendedFor: audience, Pull: size, School: school, Elevation: ee,
		HPLostPct: fight.HealthLostPct, FightSeconds: fight.Duration, Cleared: fight.Cleared, Died: fight.Died,
		TTD: endurance.Duration, Survives: !endurance.Died, CapSeconds: capSeconds,
	}
}
