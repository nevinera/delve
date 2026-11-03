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
		"teleport":    {admin: true, usage: "/teleport <x> <z> [continent], or /teleport spawn", run: runTeleport},
	}
}

// answer sends a line to a player's log. Kind is system, error or debug.
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
		answer(p, "system", commands[name].usage)
	}
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
		return fmt.Errorf("Use %s.", commands["combatdebug"].usage)
	}
	if p.combatDebug {
		answer(p, "system", "Combat debug is on.")
	} else {
		answer(p, "system", "Combat debug is off.")
	}
	return nil
}

func runTeleport(l *Layer, p *Player, args []string) error {
	usage := fmt.Errorf("Use %s.", commands["teleport"].usage)
	var continent string
	var x, z float64
	switch {
	case len(args) == 1 && strings.EqualFold(args[0], "spawn"):
		continent = l.world.Spawn.Continent
		at := l.world.SpawnAt()
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
		return fmt.Errorf("This world has no continent %q.", continent)
	}
	at, ok := l.standing(continent, x, z)
	if !ok {
		return fmt.Errorf("There's no ground at %.0f, %.0f.", x, z)
	}
	l.teleport(p, continent, at)
	answer(p, "system", fmt.Sprintf("Teleported to %.0f, %.0f on %s.", at[0], at[2], continent))
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
	before := map[int64]*Player{}
	for _, o := range l.near(p) {
		before[o.ID()] = o
	}
	l.stopCast(p)
	log.Printf("character %d: teleported to %s %v", p.ID(), continent, at)
	p.state.Continent, p.state.At, p.state.Move = continent, at, Move{Gait: "run"}
	p.motion.teleported(l.hub.now())
	l.save(p)
	p.send(encode(teleported{"teleport", continent, at, p.state.Yaw}))
	for _, o := range l.near(p) {
		if before[o.ID()] != nil {
			delete(before, o.ID())
			o.send(encode(moved{"moved", p.ID(), p.state.At, p.state.Yaw, p.state.Move}))
			continue
		}
		o.send(encode(appear{"appear", p.state}))
		p.send(encode(appear{"appear", o.state}))
	}
	for _, o := range before {
		o.send(encode(vanish{"vanish", p.ID()}))
		p.send(encode(vanish{"vanish", o.ID()}))
	}
}
