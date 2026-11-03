// Package rails calls Rails's internal API (.agents/formats.md, "Rails and the game
// server").
package rails

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// Client reaches Rails with a shared token.
type Client struct {
	baseURL string
	token   string
	http    *http.Client
}

func New(baseURL, token string) *Client {
	return &Client{baseURL: strings.TrimRight(baseURL, "/"), token: token, http: &http.Client{Timeout: 10 * time.Second}}
}

// Position is where a character was in a world.
type Position struct {
	Continent string     `json:"continent"`
	At        [3]float64 `json:"at"`
	Yaw       float64    `json:"yaw"`
}

// Character is a character as it enters a world. Class is empty until it picks one there, and
// Position is nil when it hasn't been there.
type Character struct {
	ID       int64           `json:"id"`
	Name     string          `json:"name"`
	Look     json.RawMessage `json:"look"`
	Class    string          `json:"class"`
	Position *Position       `json:"position"`
}

// Character fetches a character entering a world.
func (c *Client) Character(ctx context.Context, world, id int64) (Character, error) {
	var out Character
	err := c.get(ctx, fmt.Sprintf("/internal/worlds/%d/characters/%d", world, id), &out)
	return out, err
}

// SavePosition keeps where a character is in a world.
func (c *Client) SavePosition(ctx context.Context, world, id int64, pos Position) error {
	body, err := json.Marshal(pos)
	if err != nil {
		return err
	}
	return c.do(ctx, http.MethodPut, fmt.Sprintf("/internal/worlds/%d/characters/%d/position", world, id), body, nil)
}

// SaveClass keeps the class a character picked in a world.
func (c *Client) SaveClass(ctx context.Context, world, id int64, class string) error {
	body, err := json.Marshal(map[string]string{"class": class})
	if err != nil {
		return err
	}
	return c.do(ctx, http.MethodPut, fmt.Sprintf("/internal/worlds/%d/characters/%d/class", world, id), body, nil)
}

func (c *Client) get(ctx context.Context, path string, out any) error {
	return c.do(ctx, http.MethodGet, path, nil, out)
}

func (c *Client) do(ctx context.Context, method, path string, body []byte, out any) error {
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("X-Internal-Token", c.token)
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode/100 != 2 {
		return fmt.Errorf("rails: %s %s: %s", method, path, res.Status)
	}
	if out == nil {
		return nil
	}
	return json.NewDecoder(res.Body).Decode(out)
}
