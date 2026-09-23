package main

import (
	"os"

	"github.com/delve-mmo/game-server/internal/classdpscli"
)

func main() {
	os.Exit(classdpscli.Run(os.Args[1:], os.Stdout, os.Stderr))
}
