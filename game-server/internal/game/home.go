package game

import (
	"context"
	"fmt"
	"log"
)

// homeReachFt is how close a character has to stand to a rest point to make it its home.
const homeReachFt = 20.0

// restPointsOn is the rest points on a player's continent, standing on the ground, and its home.
func (l *Layer) restPointsOn(p *Player) restPoints {
	out := restPoints{Type: "restPoints", RestPoints: []restPoint{}, Home: p.home}
	for _, r := range l.world.RestPoints {
		if r.Continent != p.state.Continent {
			continue
		}
		at, ok := l.standing(r.Continent, r.At[0], r.At[1])
		if !ok {
			at = [3]float64{r.At[0], 0, r.At[1]}
		}
		out.RestPoints = append(out.RestPoints, restPoint{r.ID, r.Name, at})
	}
	return out
}

// makeHome makes a rest point a player stands by its home.
func (l *Layer) makeHome(p *Player, id string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.players[p.ID()] != p {
		return
	}
	r := l.world.RestPoint(id)
	if r == nil || r.Continent != p.state.Continent {
		answer(p, "system", "There's no rest point there.")
		return
	}
	if distance(p.state.At, [3]float64{r.At[0], p.state.At[1], r.At[1]}) > homeReachFt {
		answer(p, "system", "You need to be at the rest point to make it your home.")
		return
	}
	p.home = id
	p.send(encode(home{"home", id}))
	answer(p, "system", fmt.Sprintf("%s is now your home.", nameOf(r.Name)))
	world, character := l.worldID, p.ID()
	go func() {
		if err := l.hub.characters.SaveHome(context.Background(), world, character, id); err != nil {
			log.Printf("character %d: couldn't keep its home: %v", character, err)
		}
	}()
}

// goHome takes a player to its home rest point, or the spawn point when it has none or the world
// no longer has it. The layer's lock is held.
func (l *Layer) goHome(p *Player) {
	continent, x, z := l.world.Spawn.Continent, l.world.Spawn.At[0], l.world.Spawn.At[1]
	name := "where you first came into the world"
	if r := l.world.RestPoint(p.home); r != nil {
		continent, x, z, name = r.Continent, r.At[0], r.At[1], nameOf(r.Name)
	}
	at, ok := l.standing(continent, x, z)
	if !ok {
		at = [3]float64{x, 0, z}
	}
	l.teleport(p, continent, at)
	answer(p, "system", fmt.Sprintf("You're back at %s.", name))
}

func nameOf(name string) string {
	if name == "" {
		return "the rest point"
	}
	return name
}
