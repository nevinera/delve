// Command bot plays a character in a released world as a bot (internal/bot): it enters the game
// server with an entry token as the play page does, and runs a strategy until it quits or is
// stopped, then leaves. script/game/bot finds the character and world, issues the token and runs
// this; see its header for how to use it.
//
// It reads the world's ground from the commit's zip, kept in WORLD_CACHE_DIR as the game server
// keeps it.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"

	"github.com/delve-mmo/delve3d/game-server/internal/bot"
	"github.com/delve-mmo/delve3d/game-server/internal/config"
	"github.com/delve-mmo/delve3d/game-server/internal/worlds"
)

// verbosity counts -v flags.
type verbosity int

func (v *verbosity) String() string   { return strconv.Itoa(int(*v)) }
func (v *verbosity) Set(string) error { *v++; return nil }
func (v *verbosity) IsBoolFlag() bool { return true }

func main() {
	var verbose verbosity
	url := flag.String("url", "", "the game server's websocket URL, with the entry token")
	repo := flag.String("repo", "", "the world's repo (owner/name)")
	sha := flag.String("sha", "", "the commit to play")
	strategy := flag.String("strategy", "null", "the strategy")
	configArg := flag.String("config", "{}", "the strategy's config, as JSON or a JSON file")
	flag.Var(&verbose, "v", "log what's sent and heard (twice: others' movement too)")
	flag.Parse()
	if *url == "" || *repo == "" || *sha == "" {
		fail("--url, --repo and --sha are required")
	}

	log := bot.NewLog(os.Stderr, int(verbose))
	conf, err := readConfig(*configArg)
	if err != nil {
		fail(err.Error())
	}
	strat, err := bot.Build(*strategy, conf)
	if err != nil {
		fail(strings.TrimPrefix(err.Error(), bot.ErrConfig.Error()+": "))
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	cfg := config.Load()
	world, err := worlds.NewStore(cfg.CacheDir, cfg.GitHubURL).Load(ctx, *repo, *sha)
	stop()
	if err != nil {
		fail("couldn't read the world: " + err.Error())
	}

	conn, err := bot.Dial(*url, log)
	if err != nil {
		fail("couldn't reach the game server: " + err.Error())
	}
	runner := &bot.Runner{Conn: conn, Strategy: strat, Log: log, Ground: func(continent string) bot.Ground {
		if g := world.Ground(continent); g != nil {
			return g
		}
		return nil
	}}
	signals := make(chan os.Signal, 2)
	signal.Notify(signals, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		for range signals {
			runner.Interrupt()
		}
	}()
	runner.Run()
}

// readConfig reads a JSON object, given as JSON or a file of it.
func readConfig(arg string) (map[string]any, error) {
	data := []byte(arg)
	if !strings.HasPrefix(strings.TrimSpace(arg), "{") {
		var err error
		if data, err = os.ReadFile(arg); errors.Is(err, os.ErrNotExist) {
			return nil, fmt.Errorf("config file not found: %s", arg)
		} else if err != nil {
			return nil, err
		}
	}
	var conf map[string]any
	if err := json.Unmarshal(data, &conf); err != nil {
		return nil, fmt.Errorf("config must be a JSON object: %v", err)
	}
	return conf, nil
}

func fail(msg string) {
	fmt.Fprintln(os.Stderr, "Error: "+msg)
	os.Exit(1)
}
