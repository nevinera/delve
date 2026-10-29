package main

import (
	"fmt"
	"log/slog"
	"net/http"
	"os"

	"github.com/delve-mmo/delve3d/game-server/internal/config"
	"github.com/delve-mmo/delve3d/game-server/internal/game"
	"github.com/delve-mmo/delve3d/game-server/internal/rails"
	"github.com/delve-mmo/delve3d/game-server/internal/server"
	"github.com/delve-mmo/delve3d/game-server/internal/worlds"
)

func main() {
	cfg := config.Load()
	if err := cfg.Check(); err != nil {
		slog.Error("can't start", "err", err)
		os.Exit(1)
	}
	hub := game.NewHub(worlds.NewStore(cfg.CacheDir, cfg.GitHubURL), rails.New(cfg.RailsURL, cfg.RailsToken))

	addr := fmt.Sprintf(":%s", cfg.Port)
	slog.Info("starting game server", "addr", addr)

	if err := http.ListenAndServe(addr, server.New(hub, cfg.TokenSecret)); err != nil {
		slog.Error("server exited", "err", err)
		os.Exit(1)
	}
}
