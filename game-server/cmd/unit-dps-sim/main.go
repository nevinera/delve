package main

import (
	"os"

	"github.com/delve-mmo/game-server/internal/unitdpscli"
)

func main() {
	os.Exit(unitdpscli.Run(os.Args[1:], os.Stdout, os.Stderr))
}
