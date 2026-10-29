// Package server builds the game server's HTTP handler: a health check, and the websocket players
// play over (docs/formats/game-protocol.md).
package server

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/delve-mmo/delve3d/game-server/internal/game"
	"github.com/delve-mmo/delve3d/game-server/internal/token"
	"github.com/gorilla/websocket"
)

const (
	readLimit  = 4096
	readWait   = 30 * time.Second // a client sends a heartbeat at least every second
	writeWait  = 10 * time.Second
	pingPeriod = 20 * time.Second
)

// The entry token is what lets a connection in, so any page may open one.
var upgrader = websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}

// New returns the game server's HTTP handler. With no hub there's only the health check.
func New(hub *game.Hub, secret string) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /up", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	if hub != nil {
		mux.HandleFunc("GET /play", func(w http.ResponseWriter, r *http.Request) { play(hub, secret, w, r) })
	}
	return mux
}

func play(hub *game.Hub, secret string, w http.ResponseWriter, r *http.Request) {
	claims, err := token.Verify(secret, r.URL.Query().Get("token"), time.Now())
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()
	player, err := hub.Enter(r.Context(), claims)
	if err != nil {
		slog.Warn("couldn't enter", "character", claims.Character, "world", claims.World, "err", err)
		_ = conn.SetWriteDeadline(time.Now().Add(writeWait))
		_ = conn.WriteJSON(map[string]string{"type": "error", "message": err.Error()})
		return
	}
	slog.Info("entered", "character", claims.Character, "world", claims.World)
	defer slog.Info("left", "character", claims.Character, "world", claims.World)

	done := make(chan struct{})
	go func() {
		defer close(done)
		write(conn, player)
	}()
	read(conn, player)
	hub.Leave(player)
	<-done
}

// read hands the client's messages to the game until the connection ends or the player is dropped.
func read(conn *websocket.Conn, p *game.Player) {
	conn.SetReadLimit(readLimit)
	_ = conn.SetReadDeadline(time.Now().Add(readWait))
	conn.SetPongHandler(func(string) error { return conn.SetReadDeadline(time.Now().Add(readWait)) })
	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			return
		}
		_ = conn.SetReadDeadline(time.Now().Add(readWait))
		if err := p.Handle(raw); err != nil {
			p.Drop(err.Error())
			return
		}
	}
}

// write sends the game's messages to the client, and pings it, until the player is dropped. Then
// it sends what's left (a reason, say) and closes the connection, which ends read.
func write(conn *websocket.Conn, p *game.Player) {
	ping := time.NewTicker(pingPeriod)
	defer ping.Stop()
	defer conn.Close()
	send := func(b []byte) bool {
		_ = conn.SetWriteDeadline(time.Now().Add(writeWait))
		return conn.WriteMessage(websocket.TextMessage, b) == nil
	}
	for {
		select {
		case b := <-p.Send:
			if !send(b) {
				p.Drop("")
				return
			}
		case <-ping.C:
			_ = conn.SetWriteDeadline(time.Now().Add(writeWait))
			if conn.WriteMessage(websocket.PingMessage, nil) != nil {
				p.Drop("")
				return
			}
		case <-p.Gone:
			for {
				select {
				case b := <-p.Send:
					if !send(b) {
						return
					}
				default:
					_ = conn.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""), time.Now().Add(writeWait))
					return
				}
			}
		}
	}
}
