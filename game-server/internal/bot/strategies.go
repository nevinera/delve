package bot

import (
	"errors"
	"fmt"
	"maps"
	"slices"
	"strconv"
	"strings"
)

// Strategy is a bot's behavior. The runner calls Tick about ten times a second once the bot has
// entered, with the time in seconds.
type Strategy interface {
	Tick(s *State, c *Controls, now float64)
}

// ErrConfig is a strategy's config that doesn't make sense.
var ErrConfig = errors.New("bad strategy config")

// strategies are the strategies a bot can run, by name, built from their config.
var strategies = map[string]func(config map[string]any) (Strategy, error){
	"null":   func(map[string]any) (Strategy, error) { return Null{}, nil },
	"follow": newFollow,
}

// Build makes the strategy with that name from its config.
func Build(name string, config map[string]any) (Strategy, error) {
	build, ok := strategies[name]
	if !ok {
		have := strings.Join(slices.Sorted(maps.Keys(strategies)), ", ")
		return nil, fmt.Errorf("%w: unknown strategy %q (have: %s)", ErrConfig, name, have)
	}
	return build(config)
}

// Null stands still.
type Null struct{}

func (Null) Tick(*State, *Controls, float64) {}

// Follow runs toward another character once they're within notice feet, stopping stop feet away,
// and stands still otherwise. Config: {"target": "<character name>", "notice_feet": 100,
// "stop_feet": 5}. No pathing: it runs straight at them.
type Follow struct {
	Target       string
	Notice, Stop float64
}

func newFollow(config map[string]any) (Strategy, error) {
	target, _ := config["target"].(string)
	if strings.TrimSpace(target) == "" {
		return nil, fmt.Errorf("%w: follow needs a target (a character name)", ErrConfig)
	}
	notice, err := feet(config, "notice_feet", 100)
	if err != nil {
		return nil, err
	}
	stop, err := feet(config, "stop_feet", 5)
	if err != nil {
		return nil, err
	}
	if stop >= notice {
		return nil, fmt.Errorf("%w: stop_feet must be less than notice_feet", ErrConfig)
	}
	return &Follow{Target: target, Notice: notice, Stop: stop}, nil
}

func (f *Follow) Tick(s *State, c *Controls, _ float64) {
	target := s.Named(f.Target)
	if target == nil || Distance(c.At, target.At) > f.Notice {
		c.Stop()
		return
	}
	y := target.At[1]
	c.MoveToward(target.At[0], target.At[2], f.Stop, &y)
}

// feet reads a config number of feet, zero or more, as a number or a string.
func feet(config map[string]any, key string, fallback float64) (float64, error) {
	v, ok := config[key]
	if !ok {
		return fallback, nil
	}
	var f float64
	var err error
	switch v := v.(type) {
	case float64:
		f = v
	case string:
		f, err = strconv.ParseFloat(strings.TrimSpace(v), 64)
	default:
		err = errors.New("not a number")
	}
	if err != nil || f < 0 {
		return 0, fmt.Errorf("%w: %s must be a number of feet, zero or more", ErrConfig, key)
	}
	return f, nil
}
