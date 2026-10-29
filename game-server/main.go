package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/delve-mmo/delve3d/game-server/internal/config"
	"github.com/delve-mmo/delve3d/game-server/internal/game"
	"github.com/delve-mmo/delve3d/game-server/internal/rails"
	"github.com/delve-mmo/delve3d/game-server/internal/server"
	"github.com/delve-mmo/delve3d/game-server/internal/worlds"
)

// How long stopping waits for positions to be saved.
const stopWait = 10 * time.Second

func main() {
	cfg := config.Load()
	if err := cfg.Check(); err != nil {
		slog.Error("can't start", "err", err)
		os.Exit(1)
	}
	hub := game.NewHub(worlds.NewStore(cfg.CacheDir, cfg.GitHubURL), rails.New(cfg.RailsURL, cfg.RailsToken))
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	go hub.Run(ctx)

	addr := fmt.Sprintf(":%s", cfg.Port)
	slog.Info("starting game server", "addr", addr)
	go func() {
		if err := http.ListenAndServe(addr, server.New(hub, cfg.TokenSecret)); err != nil {
			slog.Error("server exited", "err", err)
			os.Exit(1)
		}
	}()

	// Stopping (a deploy, say) saves where everyone is first.
	<-ctx.Done()
	slog.Info("stopping: saving positions")
	hub.SaveAll()
	wait, cancel := context.WithTimeout(context.Background(), stopWait)
	defer cancel()
	if err := hub.Flush(wait); err != nil {
		slog.Warn("stopped before every position was saved", "err", err)
	}
}
