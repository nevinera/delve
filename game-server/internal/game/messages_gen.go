// Written by `go generate ./internal/game` in game-server, from docs/schema/messages.schema.json.
// Don't edit it: change the schema.

package game

import (
	"encoding/json"
	"github.com/delve-mmo/delve3d/game-server/internal/combat"
)

// Character: a character as others see it. Training dummies have dummy true and negative ids.
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
	// What it holds, as it comes into view
	Statuses     []shownStatus `json:"statuses,omitempty"`
	Untargetable bool          `json:"untargetable,omitempty"`
	Absorb       float64       `json:"absorb,omitempty"`
}

// Move: how a character is moving, so others can carry it on between messages: forward and strafe
// are -1, 0 or 1 (strafe 1 is left), turn is -1 (right), 0 or 1 (left), gait is walk or run, and
// jump is true as it leaves the ground.
type Move struct {
	Forward int    `json:"forward"`
	Strafe  int    `json:"strafe"`
	Turn    int    `json:"turn"`
	Gait    string `json:"gait"`
	Swim    bool   `json:"swim"`
	Jump    bool   `json:"jump"`
}

// restPoint: a rest point on your continent, at standing on the ground.
type restPoint struct {
	ID   string     `json:"id"`
	Name string     `json:"name"`
	At   [3]float64 `json:"at"`
}

// shownStatus: a status a unit holds, for its frame. lasts is seconds left, if it runs out.
type shownStatus struct {
	Status string `json:"status"`
	From   int64  `json:"from"`
	Class  string `json:"class"`
	Stacks int    `json:"stacks"`
	// Seconds left, if it runs out
	Lasts float64 `json:"lasts,omitempty"`
}

// welcome: once, on entering
type welcome struct {
	Type  string    `json:"type"`
	You   Character `json:"you"`
	Layer int       `json:"layer"`
}

// snapshot: once, after `welcome`: everyone near you
type snapshot struct {
	Type       string      `json:"type"`
	Characters []Character `json:"characters"`
}

// appear: someone comes near you. A character carries the `statuses` it holds then, each with
// `status`, `from`, `class`, `stacks` and `lasts`
type appear struct {
	Type      string    `json:"type"`
	Character Character `json:"character"`
}

// vanish: someone leaves your area, or the game
type vanish struct {
	Type string `json:"type"`
	ID   int64  `json:"id"`
}

// moved: someone near you sent `move` or `heartbeat`
type moved struct {
	Type string     `json:"type"`
	ID   int64      `json:"id"`
	At   [3]float64 `json:"at"`
	Yaw  float64    `json:"yaw"`
	Move Move       `json:"move"`
}

// statusOn: a status went on someone near you, or a dummy
type statusOn struct {
	Type string `json:"type"`
	ID   int64  `json:"id"`
	shownStatus
}

// forced: an effect moved you or someone near you. It's at `at` already, and clients play the trip
// over `seconds`, arcing `height` ft up. The server ignores your reports until then
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

// correction: your last report didn't add up: you're back at `at`
type correction struct {
	Type string     `json:"type"`
	At   [3]float64 `json:"at"`
	Yaw  float64    `json:"yaw"`
}

// used: someone near you started using an ability, with those numbers as `modify` left them:
// clients play its timeline from this
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

// swung: someone near you started an auto-attack swing
type swung struct {
	Type   string `json:"type"`
	ID     int64  `json:"id"`
	Target int64  `json:"target"`
}

// attacking: who you're auto-attacking now, 0 for no one
type attacking struct {
	Type   string `json:"type"`
	Target int64  `json:"target"`
}

// stopped: someone's cast or channel ended early
type stopped struct {
	Type string `json:"type"`
	ID   int64  `json:"id"`
}

// refused: you can't use that now
type refused struct {
	Type    string `json:"type"`
	Ability string `json:"ability"`
	Why     string `json:"why"`
}

// seesAnswer: whether the server has you seeing a unit, for what you asked with `sees`
type seesAnswer struct {
	Type   string `json:"type"`
	Target int64  `json:"target"`
	Clear  bool   `json:"clear"`
}

// cooldown: an ability of yours can't be used for this long, 0 once it can
type cooldown struct {
	Type    string  `json:"type"`
	Ability string  `json:"ability"`
	Seconds float64 `json:"seconds"`
}

// lockout: an interrupt locked you out of this school
type lockout struct {
	Type    string  `json:"type"`
	School  string  `json:"school"`
	Seconds float64 `json:"seconds"`
}

// hit: one of an ability's effects landed on someone near you
type hit struct {
	Type string `json:"type"`
	From int64  `json:"from"`
	// None for an auto-attack
	Ability  string  `json:"ability,omitempty"`
	On       int64   `json:"on"`
	Effect   string  `json:"effect"`
	Amount   float64 `json:"amount,omitempty"`
	Crit     bool    `json:"crit,omitempty"`
	Missed   bool    `json:"missed,omitempty"`
	Resource string  `json:"resource,omitempty"`
	Status   string  `json:"status,omitempty"`
	// Dodge or parry, along with missed
	Avoided string `json:"avoided,omitempty"`
	Blocked bool   `json:"blocked,omitempty"`
	// The status whose periodic effect this was
	Ticked   string  `json:"ticked,omitempty"`
	Absorbed float64 `json:"absorbed,omitempty"`
	// The status a dispel took off
	Removed string `json:"removed,omitempty"`
	// The ability an interrupt stopped
	Stopped   string  `json:"stopped,omitempty"`
	Class     string  `json:"class,omitempty"`
	Lasts     float64 `json:"lasts,omitempty"`
	Stacks    int     `json:"stacks,omitempty"`
	DPS       float64 `json:"dps,omitempty"`
	Health    float64 `json:"health"`
	MaxHealth float64 `json:"maxHealth"`
}

// healthMessage: your health or most health changed other than by a hit: a new level, or a status
// changing your most health
type healthMessage struct {
	Type      string  `json:"type"`
	ID        int64   `json:"id"`
	Health    float64 `json:"health"`
	MaxHealth float64 `json:"maxHealth"`
}

// restPoints: as you enter, if the world has rest points: those on your continent as `{ id, name,
// at }`, `at` standing on the ground, and your home's id or `""`
type restPoints struct {
	Type       string      `json:"type"`
	RestPoints []restPoint `json:"restPoints"`
	Home       string      `json:"home"`
}

// home: you made this rest point your home
type home struct {
	Type string `json:"type"`
	Home string `json:"home"`
}

// loggingOff: you'll be logged off in this long
type loggingOff struct {
	Type    string  `json:"type"`
	Seconds float64 `json:"seconds"`
}

// logOffStopped: logging off was called off
type logOffStopped struct {
	Type string `json:"type"`
	Why  string `json:"why"`
}

// loggedOff: you're logged off, and the server closes the connection
type loggedOff struct {
	Type string `json:"type"`
}

// levelMessage: someone's level changed
type levelMessage struct {
	Type  string `json:"type"`
	ID    int64  `json:"id"`
	Level int    `json:"level"`
}

// barsMessage: the action bars you set, as you enter, if you ever have
type barsMessage struct {
	Type string     `json:"type"`
	Bars [][]string `json:"bars"`
}

// buildMessage: what you've chosen, after you enter and whenever it changes
type buildMessage struct {
	Type           string            `json:"type"`
	Specialization string            `json:"specialization"`
	Talents        map[string]string `json:"talents"`
}

// effectAreaMessage: an effect area went down on your continent. `dir` is the way a line runs, and
// `follows` is who it moves with
type effectAreaMessage struct {
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

// effectAreaGone: an effect area ended
type effectAreaGone struct {
	Type string `json:"type"`
	ID   int64  `json:"id"`
}

// absorbMessage: what someone near you can still soak up changed. A character carries `absorb` too
type absorbMessage struct {
	Type   string  `json:"type"`
	ID     int64   `json:"id"`
	Absorb float64 `json:"absorb"`
}

// lookMessage: someone near you started or stopped looking like something else. Without a `look`,
// they went back to their own
type lookMessage struct {
	Type string          `json:"type"`
	ID   int64           `json:"id"`
	Look json.RawMessage `json:"look"`
}

// gearMessage: what someone near you holds changed, and `look` is their own look with it
type gearMessage struct {
	Type string          `json:"type"`
	ID   int64           `json:"id"`
	Look json.RawMessage `json:"look"`
}

// targetable: someone near you became targetable or stopped being. A character carries
// `untargetable` while it can't be
type targetable struct {
	Type       string `json:"type"`
	ID         int64  `json:"id"`
	Targetable bool   `json:"targetable"`
}

// controlsMessage: what's holding you now, a list of `control` words
type controlsMessage struct {
	Type     string   `json:"type"`
	Controls []string `json:"controls"`
}

// speedMessage: how fast you go now, 100 being plain
type speedMessage struct {
	Type          string  `json:"type"`
	MovementSpeed float64 `json:"movementSpeed"`
}

// statusChanged: the copy of a status that `from` put on `id` has different stacks or time left
// now. `lasts` is seconds left, or 0 if it stays until removed
type statusChanged struct {
	Type   string `json:"type"`
	ID     int64  `json:"id"`
	Status string `json:"status"`
	From   int64  `json:"from"`
	Stacks int    `json:"stacks"`
	// Seconds left, or 0 if it stays until removed
	Lasts float64 `json:"lasts"`
}

// statusGone: the copy of a status that `from` put on `id` ran out or something took it off
type statusGone struct {
	Type   string `json:"type"`
	ID     int64  `json:"id"`
	Status string `json:"status"`
	From   int64  `json:"from"`
}

// resources: how much of each resource you have and can hold, by key, at most twice a second
type resources struct {
	Type      string             `json:"type"`
	Resources map[string]float64 `json:"resources"`
	Max       map[string]float64 `json:"max"`
}

// logLine: a line for your log
type logLine struct {
	Type string `json:"type"`
	// reply (an answer to what you typed or did), status (what's happened to you), error (errors and
	// warnings) or debug
	Kind string `json:"kind"`
	Text string `json:"text"`
}

// teleported: the server moved you there. On another continent, the client loads it
type teleported struct {
	Type      string     `json:"type"`
	Continent string     `json:"continent"`
	At        [3]float64 `json:"at"`
	Yaw       float64    `json:"yaw"`
}

// errorMessage: before the server closes the connection
type errorMessage struct {
	Type    string `json:"type"`
	Message string `json:"message"`
}

// incoming: a message a client sends. Each field is in one or more of them.
type incoming struct {
	Type           string            `json:"type"`
	Class          string            `json:"class"`
	T              float64           `json:"t"`
	At             [3]float64        `json:"at"`
	Yaw            float64           `json:"yaw"`
	Move           *Move             `json:"move"`
	Ability        string            `json:"ability"`
	Target         int64             `json:"target"`
	Spot           *[3]float64       `json:"spot"`
	Bars           [][]string        `json:"bars"`
	Specialization string            `json:"specialization"`
	Talents        map[string]string `json:"talents"`
	// MakeHome's rest point
	Rest string `json:"rest"`
	Line string `json:"line"`
}
