package railsclient

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

// Client posts award requests to the Rails internal API.
type Client struct {
	baseURL string
	token   string
	http    *http.Client
}

// New constructs a Client. baseURL should not have a trailing slash.
func New(baseURL, token string) *Client {
	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		token:   token,
		http:    &http.Client{Timeout: 10 * time.Second},
	}
}

// FromEnv reads RAILS_URL and RAILS_INTERNAL_TOKEN from the environment.
// Returns nil if either is absent, so callers can guard with a nil check.
func FromEnv() *Client {
	url := os.Getenv("RAILS_URL")
	token := os.Getenv("RAILS_INTERNAL_TOKEN")
	if url == "" || token == "" {
		return nil
	}
	return New(url, token)
}

type awardBody struct {
	Zone        zoneRef                  `json:"zone"`
	Identifier  string                   `json:"identifier"`
	Name        string                   `json:"name"`
	Slot        string                   `json:"slot"`
	Ilvl        int                      `json:"ilvl"`
	Description string                   `json:"description,omitempty"`
	Stats       instanceconfig.ItemStats `json:"stats"`
}

type zoneRef struct {
	DatabaseID string `json:"database_id"`
	Identifier string `json:"identifier"`
	Version    string `json:"version"`
}

type awardResponse struct {
	Status string `json:"status"`
}

// AwardItem posts a character item award to Rails.
// Returns (true, nil) if the item was newly awarded and should be removed from loot.
// Returns (false, nil) if the item should stay in loot (already owned this version, or already owned other version).
// Returns (false, err) on network or server error.
func (c *Client) AwardItem(characterDatabaseID, zoneDatabaseID, zoneIdentifier, zoneVersion string, item instanceconfig.Item) (bool, error) {
	body := awardBody{
		Zone:        zoneRef{DatabaseID: zoneDatabaseID, Identifier: zoneIdentifier, Version: zoneVersion},
		Identifier:  item.Identifier,
		Name:        item.Name,
		Slot:        item.Slot,
		Ilvl:        item.Ilvl,
		Description: item.Description,
		Stats:       item.Stats,
	}
	data, err := json.Marshal(body)
	if err != nil {
		return false, fmt.Errorf("marshal: %w", err)
	}
	url := fmt.Sprintf("%s/internal_api/characters/%s/character_items", c.baseURL, characterDatabaseID)
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(data))
	if err != nil {
		return false, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Token", c.token)

	res, err := c.http.Do(req)
	if err != nil {
		return false, fmt.Errorf("http: %w", err)
	}
	defer res.Body.Close()

	switch res.StatusCode {
	case http.StatusCreated:
		var resp awardResponse
		json.NewDecoder(res.Body).Decode(&resp) //nolint:errcheck
		return resp.Status != "already_owned_other_version", nil
	case http.StatusConflict:
		return false, nil
	default:
		return false, fmt.Errorf("rails returned %d", res.StatusCode)
	}
}
