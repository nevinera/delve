package game

import (
	"encoding/json"
	"math"

	"github.com/delve-mmo/delve3d/game-server/internal/combat"
)

// The messages of .agents/formats.md.

// Move is how a character is moving, so others can carry it on between messages.
type Move struct {
	Forward int    `json:"forward"`
	Strafe  int    `json:"strafe"`
	Turn    int    `json:"turn"`
	Gait    string `json:"gait"`
	Swim    bool   `json:"swim"`
	Jump    bool   `json:"jump"`
}

// Character is a character as others see it.
type Character struct {
	ID        int64           `json:"id"`
	Name      string          `json:"name"`
	Look      json.RawMessage `json:"look"`
	Continent string          `json:"continent"`
	At        [3]float64      `json:"at"`
	Yaw       float64         `json:"yaw"`
	Move      Move            `json:"move"`
	Class     string          `json:"class,omitempty"`
	Level     int             `json:"level,omitempty"`
	Dummy     bool            `json:"dummy,omitempty"`
	Health    float64         `json:"health"`
	MaxHealth float64         `json:"maxHealth"`
	Statuses  []shownStatus   `json:"statuses,omitempty"` // what it holds, as it comes into view

	Untargetable bool    `json:"untargetable,omitempty"`
	Absorb       float64 `json:"absorb,omitempty"`
}

// shownStatus is a status a unit holds, for its frame.
type shownStatus struct {
	Status string  `json:"status"`
	From   int64   `json:"from"`
	Class  string  `json:"class"`
	Stacks int     `json:"stacks"`
	Lasts  float64 `json:"lasts,omitempty"` // seconds left, if it runs out
}

// statusOn is a status going on a unit.
type statusOn struct {
	Type string `json:"type"`
	ID   int64  `json:"id"`
	shownStatus
}

// incoming is a message from a client: move, heartbeat, use, stop, attack or command. T is the client's clock, in
// milliseconds.
type incoming struct {
	Type    string      `json:"type"`
	T       float64     `json:"t"`
	At      [3]float64  `json:"at"`
	Yaw     float64     `json:"yaw"`
	Move    *Move       `json:"move"`
	Ability string      `json:"ability"`
	Target  int64       `json:"target"`
	Spot    *[3]float64 `json:"spot"`
	Line    string      `json:"line"`

	Specialization string            `json:"specialization"`
	Talents        map[string]string `json:"talents"`
	Bars           [][]string        `json:"bars"`
}

// used says someone has started using an ability. The client plays its timeline from this.
type used struct {
	Type    string      `json:"type"`
	ID      int64       `json:"id"`
	Class   string      `json:"class"`
	Ability string      `json:"ability"`
	Target  int64       `json:"target,omitempty"`
	Spot    *[3]float64 `json:"spot,omitempty"`
	GCD     float64     `json:"gcd"`

	// The ability as it's being used, with what changes it counted.
	CastTime  float64         `json:"castTime"`
	Channel   *combat.Channel `json:"channel,omitempty"`
	Cost      []combat.Cost   `json:"cost,omitempty"`
	School    string          `json:"school,omitempty"`
	Schools   []string        `json:"schools,omitempty"`
	Animation string          `json:"animation,omitempty"`
}

// barsMessage is the action bars you set.
type barsMessage struct {
	Type string     `json:"type"`
	Bars [][]string `json:"bars"`
}

// buildMessage says what specialization and talents you have.
type buildMessage struct {
	Type           string            `json:"type"`
	Specialization string            `json:"specialization"`
	Talents        map[string]string `json:"talents"`
}

// swung says someone has started an auto-attack swing.
type swung struct {
	Type   string `json:"type"`
	ID     int64  `json:"id"`
	Target int64  `json:"target"`
}

// attacking says who you're auto-attacking, 0 for no one.
type attacking struct {
	Type   string `json:"type"`
	Target int64  `json:"target"`
}

type refused struct {
	Type    string `json:"type"`
	Ability string `json:"ability"`
	Why     string `json:"why"`
}

// seesAnswer is whether the server has you seeing a unit.
type seesAnswer struct {
	Type   string `json:"type"`
	Target int64  `json:"target"`
	Clear  bool   `json:"clear"`
}

type stopped struct {
	Type string `json:"type"`
	ID   int64  `json:"id"`
}

type cooldown struct {
	Type    string  `json:"type"`
	Ability string  `json:"ability"`
	Seconds float64 `json:"seconds"`
}

// forced is a character being moved by an effect: it's at `at` already, and clients play the trip.
type forced struct {
	Type    string     `json:"type"`
	ID      int64      `json:"id"`
	Kind    string     `json:"kind"`
	From    [3]float64 `json:"from"`
	At      [3]float64 `json:"at"`
	Yaw     float64    `json:"yaw"`
	Seconds float64    `json:"seconds"`
	Height  float64    `json:"height"`
}

// areaMessage is an area going down on the ground.
type areaMessage struct {
	Type    string     `json:"type"`
	ID      int64      `json:"id"`
	From    int64      `json:"from"`
	Ability string     `json:"ability"`
	Affects string     `json:"affects"`
	At      [3]float64 `json:"at"`
	Radius  float64    `json:"radius"`
	Line    bool       `json:"line,omitempty"`
	Width   float64    `json:"width,omitempty"`
	Dir     [2]float64 `json:"dir"`
	Lasts   float64    `json:"lasts"`
	Follows int64      `json:"follows,omitempty"`
}

type areaGone struct {
	Type string `json:"type"`
	ID   int64  `json:"id"`
}

// absorbMessage is how much a unit's absorbs have left, when it changes.
type absorbMessage struct {
	Type   string  `json:"type"`
	ID     int64   `json:"id"`
	Absorb float64 `json:"absorb"`
}

// lookMessage is what a unit looks like now a `transform` has started or ended. An empty look means its own.
type lookMessage struct {
	Type string          `json:"type"`
	ID   int64           `json:"id"`
	Look json.RawMessage `json:"look"`
}

// gearMessage is a character's own look now what it holds has changed.
type gearMessage struct {
	Type string          `json:"type"`
	ID   int64           `json:"id"`
	Look json.RawMessage `json:"look"`
}

// targetable says whether a unit can be picked as a target, when that changes.
type targetable struct {
	Type       string `json:"type"`
	ID         int64  `json:"id"`
	Targetable bool   `json:"targetable"`
}

// controlsMessage is what's holding its hearer now.
type controlsMessage struct {
	Type     string   `json:"type"`
	Controls []string `json:"controls"`
}

// lockout is a school its hearer can't use for a while.
type lockout struct {
	Type    string  `json:"type"`
	School  string  `json:"school"`
	Seconds float64 `json:"seconds"`
}

// hit is one of an ability's effects landing on someone.
type hit struct {
	Type      string  `json:"type"`
	From      int64   `json:"from"`
	Ability   string  `json:"ability,omitempty"` // none for an auto-attack
	On        int64   `json:"on"`
	Effect    string  `json:"effect"`
	Amount    float64 `json:"amount,omitempty"`
	Crit      bool    `json:"crit,omitempty"`
	Missed    bool    `json:"missed,omitempty"`
	Resource  string  `json:"resource,omitempty"`
	Status    string  `json:"status,omitempty"`
	Avoided   string  `json:"avoided,omitempty"` // dodge or parry, along with missed
	Blocked   bool    `json:"blocked,omitempty"`
	Ticked    string  `json:"ticked,omitempty"` // the status whose periodic effect this was
	Absorbed  float64 `json:"absorbed,omitempty"`
	Removed   string  `json:"removed,omitempty"` // the status a dispel took off
	Stopped   string  `json:"stopped,omitempty"` // the ability an interrupt stopped
	Class     string  `json:"class,omitempty"`
	Lasts     float64 `json:"lasts,omitempty"`
	Stacks    int     `json:"stacks,omitempty"`
	DPS       float64 `json:"dps,omitempty"`
	Health    float64 `json:"health"`
	MaxHealth float64 `json:"maxHealth"`
}

// levelMessage says a character's level changed.
type levelMessage struct {
	Type  string `json:"type"`
	ID    int64  `json:"id"`
	Level int    `json:"level"`
}

type healthMessage struct {
	Type      string  `json:"type"`
	ID        int64   `json:"id"`
	Health    float64 `json:"health"`
	MaxHealth float64 `json:"maxHealth"`
}

type speedMessage struct {
	Type          string  `json:"type"`
	MovementSpeed float64 `json:"movementSpeed"`
}

type statusGone struct {
	Type   string `json:"type"`
	ID     int64  `json:"id"`
	Status string `json:"status"`
	From   int64  `json:"from"`
}

type statusChanged struct {
	Type   string  `json:"type"`
	ID     int64   `json:"id"`
	Status string  `json:"status"`
	From   int64   `json:"from"`
	Stacks int     `json:"stacks"`
	Lasts  float64 `json:"lasts"` // seconds left, or 0 if it stays until removed
}

type resources struct {
	Type      string             `json:"type"`
	Resources map[string]float64 `json:"resources"`
	Max       map[string]float64 `json:"max"`
}

type welcome struct {
	Type  string    `json:"type"`
	You   Character `json:"you"`
	Layer int       `json:"layer"`
}

type snapshot struct {
	Type       string      `json:"type"`
	Characters []Character `json:"characters"`
}

type appear struct {
	Type      string    `json:"type"`
	Character Character `json:"character"`
}

type vanish struct {
	Type string `json:"type"`
	ID   int64  `json:"id"`
}

type moved struct {
	Type string     `json:"type"`
	ID   int64      `json:"id"`
	At   [3]float64 `json:"at"`
	Yaw  float64    `json:"yaw"`
	Move Move       `json:"move"`
}

// logLine is a line for a player's log. Kind is system, error or debug.
type logLine struct {
	Type string `json:"type"`
	Kind string `json:"kind"`
	Text string `json:"text"`
}

// teleported says the server has moved you.
type teleported struct {
	Type      string     `json:"type"`
	Continent string     `json:"continent"`
	At        [3]float64 `json:"at"`
	Yaw       float64    `json:"yaw"`
}

type correction struct {
	Type string     `json:"type"`
	At   [3]float64 `json:"at"`
	Yaw  float64    `json:"yaw"`
}

type errorMessage struct {
	Type    string `json:"type"`
	Message string `json:"message"`
}

func encode(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}

// clean makes a client's movement something others can draw: steps of -1, 0 or 1 and a gait it
// knows.
func (m Move) clean() Move {
	step := func(n int) int { return max(-1, min(1, n)) }
	m.Forward, m.Strafe, m.Turn = step(m.Forward), step(m.Strafe), step(m.Turn)
	if m.Gait != "walk" && m.Gait != "sprint" {
		m.Gait = "run"
	}
	return m
}

func finite(at [3]float64, yaw float64, t float64) bool {
	for _, v := range append(at[:], t) {
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return false
		}
	}
	return !math.IsNaN(yaw) && !math.IsInf(yaw, 0)
}
