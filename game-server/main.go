package main

import (
	"fmt"
	"log/slog"
	"net/http"
	"os"

	"github.com/delve-mmo/delve3d/game-server/internal/config"
	"github.com/delve-mmo/delve3d/game-server/internal/server"
)

func main() {
	cfg := config.Load()

	addr := fmt.Sprintf(":%s", cfg.Port)
	slog.Info("starting game server", "addr", addr)

	if err := http.ListenAndServe(addr, server.New()); err != nil {
		slog.Error("server exited", "err", err)
		os.Exit(1)
	}
}
