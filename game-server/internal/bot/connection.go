package bot

import (
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// Conn is the bot's connection to the game server.
type Conn interface {
	// Read waits up to timeout for messages, and gives those that have come (maybe none).
	Read(timeout time.Duration) []Message
	Send(v any)
	// Closed is whether the connection has closed, and why.
	Closed() (bool, string)
	// Close starts a clean close, and waits up to `wait` for the server to answer it, or until
	// stopWaiting says not to.
	Close(wait time.Duration, stopWaiting func() bool)
}

// Socket is a websocket to the game server (ws:// or wss://), with messages as JSON.
type Socket struct {
	ws     *websocket.Conn
	log    *Log
	in     chan Message
	mu     sync.Mutex
	reason string
	done   chan struct{}
}

// Dial connects to the game server at url.
func Dial(url string, log *Log) (*Socket, error) {
	ws, res, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		if res != nil {
			return nil, fmt.Errorf("%w (%s)", err, res.Status)
		}
		return nil, err
	}
	s := &Socket{ws: ws, log: log, in: make(chan Message, 256), done: make(chan struct{})}
	go s.receive()
	return s, nil
}

func (s *Socket) receive() {
	defer close(s.done)
	defer close(s.in)
	for {
		_, data, err := s.ws.ReadMessage()
		if err != nil {
			reason := "connection lost"
			if ce, ok := err.(*websocket.CloseError); ok {
				reason = fmt.Sprintf("%d %s", ce.Code, ce.Text)
			}
			s.closed(reason)
			return
		}
		var m Message
		if err := json.Unmarshal(data, &m); err != nil {
			s.log.Warn("non-JSON message: %.80s", data)
			continue
		}
		m.Raw = data
		s.in <- m
	}
}

func (s *Socket) closed(reason string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.reason == "" {
		s.reason = reason
	}
}

func (s *Socket) Read(timeout time.Duration) []Message {
	var got []Message
	select {
	case m, ok := <-s.in:
		if !ok {
			return nil
		}
		got = append(got, m)
	case <-time.After(timeout):
		return nil
	}
	for {
		select {
		case m, ok := <-s.in:
			if !ok {
				return got
			}
			got = append(got, m)
		default:
			return got
		}
	}
}

func (s *Socket) Send(v any) {
	if closed, _ := s.Closed(); closed {
		return
	}
	if err := s.ws.WriteJSON(v); err != nil {
		s.closed("write failed: " + err.Error())
	}
}

func (s *Socket) Closed() (bool, string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.reason != "", s.reason
}

func (s *Socket) Close(wait time.Duration, stopWaiting func() bool) {
	defer s.ws.Close()
	if closed, _ := s.Closed(); closed {
		return
	}
	bye := websocket.FormatCloseMessage(websocket.CloseNormalClosure, "")
	if err := s.ws.WriteControl(websocket.CloseMessage, bye, time.Now().Add(time.Second)); err != nil {
		return
	}
	deadline := time.Now().Add(wait)
	for time.Now().Before(deadline) && !stopWaiting() {
		select {
		case <-s.done:
			return
		case <-time.After(50 * time.Millisecond):
		}
	}
}
