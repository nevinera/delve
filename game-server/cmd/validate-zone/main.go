package main

import (
	"os"

	"github.com/delve-mmo/game-server/internal/validator"
)

func main() {
	os.Exit(validator.Run(os.Args[1:], os.Stdout, os.Stderr))
}
