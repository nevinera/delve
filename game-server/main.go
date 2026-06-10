package main

import (
	"fmt"
	"log/slog"
	"net/http"
	"os"

	"github.com/delve-mmo/game-server/internal/config"
	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/server"
	"github.com/delve-mmo/game-server/internal/version"
)

func main() {
	cfg := config.Load()

	if cfg.Debug {
		slog.SetDefault(slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
			Level: slog.LevelDebug,
		})))
	}

	if len(cfg.AuthTokens) == 0 {
		slog.Warn("GAME_SERVER_AUTH_TOKENS is not set; all requests to protected endpoints will be rejected")
	}

	registry := instance.NewRegistry()
	handler := server.New(registry, cfg)

	addr := fmt.Sprintf(":%s", cfg.Port)
	slog.Info("starting game server", "addr", addr, "version", version.Current, "debug", cfg.Debug)

	if err := http.ListenAndServe(addr, handler); err != nil {
		slog.Error("server exited", "err", err)
		os.Exit(1)
	}
}
