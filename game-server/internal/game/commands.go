package game

import (
	"fmt"
	"log"
	"math"
	"slices"
	"strconv"
	"strings"
)

// Commands: what a player types after a slash. The server reads every one and answers in the
// player's log, and those marked admin are only for a system admin's characters.

const maxCommandLine = 200

type command struct {
	admin bool
	usage string
	run   func(l *Layer, p *Player, args []string) error
}

var commands map[string]command

func init() {
	commands = map[string]command{
		"combatdebug": {admin: true, usage: "/combatdebug [on or off]", run: runCombatDebug},
		"help":        {usage: "/help", run: runHelp},
		"level":       {admin: true, usage: "/level <1 to 100>", run: runLevel},
		"spar":        {usage: "/spar [on or off]", run: runSpar},
		"teleport":    {admin: true, usage: "/teleport <x> <z> [continent], /teleport spawn or /teleport home", run: runTeleport},
		"weapon":      {admin: true, usage: "/weapon <main hand> [off hand]", run: runWeapon},
	}
}

// answer sends a line to a player's log. Kind is reply (an answer to what they typed or did),
// status (what's happened to them), error (for errors and warnings) or debug.
// reply is what a command says back to the player when it can't do what they asked: a sentence
// for them to read, not an error for code.
type reply string

func (r reply) Error() string { return string(r) }

func replyf(format string, args ...any) error { return reply(fmt.Sprintf(format, args...)) }

func answer(p *Player, kind, text string) {
	p.send(encode(logLine{"log", kind, text}))
}

// command runs what a player typed, and answers in its log.
func (l *Layer) command(p *Player, line string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.players[p.ID()] != p {
		return
	}
	fields := strings.Fields(line)
	if len(line) > maxCommandLine || len(fields) == 0 || !strings.HasPrefix(fields[0], "/") {
		answer(p, "error", "Commands start with /. Try /help.")
		return
	}
	name := strings.ToLower(fields[0][1:])
	c, found := commands[name]
	if !found {
		answer(p, "error", fmt.Sprintf("There's no /%s. Try /help.", name))
		return
	}
	if c.admin && !p.systemAdmin {
		answer(p, "error", fmt.Sprintf("You can't use /%s.", name))
		return
	}
	if err := c.run(l, p, fields[1:]); err != nil {
		answer(p, "error", err.Error())
	}
}

func runHelp(_ *Layer, p *Player, _ []string) error {
	names := make([]string, 0, len(commands))
	for name, c := range commands {
		if !c.admin || p.systemAdmin {
			names = append(names, name)
		}
	}
	slices.Sort(names)
	for _, name := range names {
		answer(p, "reply", commands[name].usage)
	}
	return nil
}

func runSpar(_ *Layer, p *Player, args []string) error {
	switch {
	case len(args) == 0:
		p.fight.sparring = !p.fight.sparring
	case len(args) == 1 && args[0] == "on":
		p.fight.sparring = true
	case len(args) == 1 && args[0] == "off":
		p.fight.sparring = false
	default:
		return fmt.Errorf("usage: %s", commands["spar"].usage)
	}
	if p.fight.sparring {
		answer(p, "reply", "Training dummies in reach now swing back at you, for 5% of your health. They won't kill you.")
	} else {
		answer(p, "reply", "Training dummies have stopped swinging at you.")
	}
	return nil
}

const maxLevel = 100

func runLevel(l *Layer, p *Player, args []string) error {
	usage := replyf("Use %s.", commands["level"].usage)
	if len(args) != 1 {
		return usage
	}
	level, err := strconv.Atoi(args[0])
	if err != nil || level < 1 || level > maxLevel {
		return usage
	}
	if p.fight.class == nil {
		return replyf("Pick a class first.")
	}
	l.setLevel(p, level)
	answer(p, "reply", fmt.Sprintf("You're level %d now, in this world.", level))
	return nil
}

// What a character can hold (client/src/character/weapons.js).
var (
	twoHanded = []string{"greatsword", "greataxe", "maul", "polearm", "staff", "bow", "crossbow", "gun"}
	oneHanded = []string{"none", "sword", "axe", "mace", "dagger", "fist", "wand", "thrown"}
	offHands  = []string{"none", "shield", "orb", "sword", "axe", "mace", "dagger", "fist"}
)

// runWeapon changes what a character holds until it leaves.
func runWeapon(l *Layer, p *Player, args []string) error {
	if len(args) < 1 || len(args) > 2 {
		return replyf("Use %s.", commands["weapon"].usage)
	}
	main, off := strings.ToLower(args[0]), "none"
	if len(args) == 2 {
		off = strings.ToLower(args[1])
	}
	if !slices.Contains(twoHanded, main) && !slices.Contains(oneHanded, main) {
		return replyf("There's no %s. Main hands: %s.", main, strings.Join(append(slices.Clone(oneHanded), twoHanded...), ", "))
	}
	if !slices.Contains(offHands, off) {
		return replyf("There's no %s. Off hands: %s.", off, strings.Join(offHands, ", "))
	}
	if off != "none" && slices.Contains(twoHanded, main) {
		return replyf("A %s takes both hands.", main)
	}
	p.fight.ownWeapons = true
	if p.wear(main, off) {
		l.tellOf(p.ID(), encode(gearMessage{"gear", p.ID(), p.state.Look}))
	}
	answer(p, "reply", fmt.Sprintf("You're holding %s and %s until you leave.", main, off))
	return nil
}

func runCombatDebug(_ *Layer, p *Player, args []string) error {
	switch {
	case len(args) == 0:
		p.combatDebug = !p.combatDebug
	case len(args) == 1 && strings.EqualFold(args[0], "on"):
		p.combatDebug = true
	case len(args) == 1 && strings.EqualFold(args[0], "off"):
		p.combatDebug = false
	default:
		return replyf("Use %s.", commands["combatdebug"].usage)
	}
	if p.combatDebug {
		answer(p, "reply", "Combat debug is on.")
	} else {
		answer(p, "reply", "Combat debug is off.")
	}
	return nil
}

func runTeleport(l *Layer, p *Player, args []string) error {
	usage := replyf("Use %s.", commands["teleport"].usage)
	var continent string
	var x, z float64
	switch {
	case len(args) == 1 && strings.EqualFold(args[0], "spawn"):
		continent = l.world.Spawn.Continent
		at := l.world.SpawnAt()
		x, z = at[0], at[2]
	case len(args) == 1 && strings.EqualFold(args[0], "home"):
		continent = l.world.Spawn.Continent
		at := l.world.SpawnAt()
		if r := l.world.RestPoint(p.home); r != nil {
			continent, at = r.Continent, [3]float64{r.At[0], 0, r.At[1]}
		}
		x, z = at[0], at[2]
	case len(args) == 2 || len(args) == 3:
		var errX, errZ error
		x, errX = strconv.ParseFloat(args[0], 64)
		z, errZ = strconv.ParseFloat(args[1], 64)
		if errX != nil || errZ != nil || !finite([3]float64{x, 0, z}, 0, 0) {
			return usage
		}
		continent = p.state.Continent
		if len(args) == 3 {
			continent = args[2]
		}
	default:
		return usage
	}
	if !slices.Contains(l.world.Continents, continent) {
		return replyf("This world has no continent %q.", continent)
	}
	at, ok := l.standing(continent, x, z)
	if !ok {
		return replyf("There's no ground at %.0f, %.0f.", x, z)
	}
	l.teleport(p, continent, at)
	answer(p, "reply", fmt.Sprintf("Teleported to %.0f, %.0f on %s.", at[0], at[2], continent))
	return nil
}

// standing is where a character stands at (x, z): on the ground, or on the water if it's deep.
// False if the continent's ground says there's nothing there. A continent with no ground known
// puts it at height 0.
func (l *Layer) standing(continent string, x, z float64) ([3]float64, bool) {
	at := [3]float64{x, 0, z}
	g := l.ground(continent)
	if g == nil {
		return at, true
	}
	s, ok, err := g.At(x, z)
	if !ok || err != nil {
		return at, false
	}
	at[1] = s.Ground
	if !math.IsNaN(s.Water) && s.Water-swimDepth > s.Ground {
		at[1] = s.Water - swimDepth
	}
	return at, true
}

// teleport moves a player there at once, ending what it was casting. Those it leaves see it vanish,
// and those it arrives by see it appear. The layer's lock is held.
func (l *Layer) teleport(p *Player, continent string, at [3]float64) {
	l.stopCast(p)
	l.stopAttacking(p)
	log.Printf("character %d: teleported to %s %v", p.ID(), continent, at)
	p.motion.teleported(l.hub.now())
	l.relocate(p, continent, at, encode(teleported{"teleport", continent, at, p.state.Yaw}), encode(moved{"moved", p.ID(), at, p.state.Yaw, Move{Gait: "run"}}))
}
