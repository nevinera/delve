package main

import (
	"os"

	"github.com/delve-mmo/game-server/internal/classttdcli"
)

func main() {
	os.Exit(classttdcli.Run(os.Args[1:], os.Stdout, os.Stderr))
}
