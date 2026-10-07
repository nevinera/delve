package railsclient

import (
	"bytes"
	"encoding/json"
	"errors"
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
	Zone        zoneRef  `json:"zone"`
	Identifier  string   `json:"identifier"`
	Name        string   `json:"name"`
	Slot        string   `json:"slot"`
	Elvl        int      `json:"elvl"`
	Shield      bool     `json:"shield,omitempty"`
	WeaponType  *string  `json:"weaponType,omitempty"`
	Description string   `json:"description,omitempty"`
	Primary     *string  `json:"primary,omitempty"`
	Secondaries []string `json:"secondaries,omitempty"`
	UpgradeOnly bool     `json:"upgrade_only,omitempty"`
}

type zoneRef struct {
	DatabaseID string `json:"database_id"`
	Identifier string `json:"identifier"`
	Version    string `json:"version"`
}

type awardResponse struct {
	Status string `json:"status"`
}

// AwardItem posts an item award for a world character to Rails.
// Returns (remove, confirmedOwned, exactVersion, err).
// remove=true means the item was newly awarded and should be removed from loot.
// confirmedOwned=true means Rails confirmed the character owns this zone version of the item.
// exactVersion=true means Rails returned 409 - world character already holds this exact item version.
// confirmedOwned=false only on network or server errors.
func (c *Client) AwardItem(worldCharacterDatabaseID, zoneDatabaseID, zoneIdentifier, zoneVersion string, item instanceconfig.Item, upgradeOnly bool) (bool, bool, bool, error) {
	body := awardBody{
		Zone:        zoneRef{DatabaseID: zoneDatabaseID, Identifier: zoneIdentifier, Version: zoneVersion},
		Identifier:  item.Identifier,
		Name:        item.Name,
		Slot:        item.Slot,
		Elvl:        item.Elvl,
		Shield:      item.Shield,
		WeaponType:  item.WeaponType,
		Description: item.Description,
		Primary:     item.Primary,
		Secondaries: item.Secondaries,
		UpgradeOnly: upgradeOnly,
	}
	data, err := json.Marshal(body)
	if err != nil {
		return false, false, false, fmt.Errorf("marshal: %w", err)
	}
	url := fmt.Sprintf("%s/internal_api/world_characters/%s/character_items", c.baseURL, worldCharacterDatabaseID)
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(data))
	if err != nil {
		return false, false, false, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Token", c.token)

	res, err := c.http.Do(req)
	if err != nil {
		return false, false, false, fmt.Errorf("http: %w", err)
	}
	defer func() { _ = res.Body.Close() }()

	switch res.StatusCode {
	case http.StatusCreated:
		var resp awardResponse
		json.NewDecoder(res.Body).Decode(&resp) //nolint:errcheck
		return resp.Status != "already_owned_other_version", true, false, nil
	case http.StatusConflict:
		return false, true, true, nil // character already has this exact version
	case http.StatusUnprocessableEntity:
		return false, false, false, nil // upgrade_only with no prior version - not an error
	default:
		return false, false, false, fmt.Errorf("rails returned %d", res.StatusCode)
	}
}

// FetchEquippedItems retrieves a world character's currently equipped items
// from Rails, keyed by equipped slot.
func (c *Client) FetchEquippedItems(worldCharacterDatabaseID string) (map[string]instanceconfig.EquippedItem, error) {
	url := fmt.Sprintf("%s/internal_api/world_characters/%s/equipped_items", c.baseURL, worldCharacterDatabaseID)
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("X-Internal-Token", c.token)

	res, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("http: %w", err)
	}
	defer func() { _ = res.Body.Close() }()

	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("rails returned %d", res.StatusCode)
	}
	var items map[string]instanceconfig.EquippedItem
	if err := json.NewDecoder(res.Body).Decode(&items); err != nil {
		return nil, fmt.Errorf("decode: %w", err)
	}
	return items, nil
}

type zoneExitBody struct {
	ZoneIdentifier string `json:"zone_identifier"`
	Connection     string `json:"connection"`
}

// ZoneExit tells Rails a world character left its zone through connection
// ("mapId/connectionId"), so Rails can work out where that leads and move
// the character there. A non-2xx response is an error carrying Rails'
// "error" message when it sends one.
func (c *Client) ZoneExit(worldCharacterDatabaseID, zoneIdentifier, connection string) error {
	data, err := json.Marshal(zoneExitBody{ZoneIdentifier: zoneIdentifier, Connection: connection})
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}
	url := fmt.Sprintf("%s/internal_api/world_characters/%s/zone_exits", c.baseURL, worldCharacterDatabaseID)
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Token", c.token)

	res, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("http: %w", err)
	}
	defer func() { _ = res.Body.Close() }()

	if res.StatusCode >= 200 && res.StatusCode < 300 {
		return nil
	}
	var body struct {
		Error string `json:"error"`
	}
	json.NewDecoder(res.Body).Decode(&body) //nolint:errcheck
	if body.Error != "" {
		return fmt.Errorf("rails returned %d: %s", res.StatusCode, body.Error)
	}
	return fmt.Errorf("rails returned %d", res.StatusCode)
}

// HasFlag asks Rails whether a world character holds flag
// ("type/identifier", see plans/flags.md).
func (c *Client) HasFlag(worldCharacterDatabaseID, flag string) (bool, error) {
	url := fmt.Sprintf("%s/internal_api/world_characters/%s/flags/%s", c.baseURL, worldCharacterDatabaseID, flag)
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return false, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("X-Internal-Token", c.token)

	res, err := c.http.Do(req)
	if err != nil {
		return false, fmt.Errorf("http: %w", err)
	}
	defer func() { _ = res.Body.Close() }()

	if res.StatusCode != http.StatusOK {
		return false, fmt.Errorf("rails returned %d", res.StatusCode)
	}
	var body struct {
		Held bool `json:"held"`
	}
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		return false, fmt.Errorf("decode: %w", err)
	}
	return body.Held, nil
}

// GrantFlag grants a world character flag ("type/identifier"). Granting a
// flag they already hold succeeds and changes nothing.
func (c *Client) GrantFlag(worldCharacterDatabaseID, flag string) error {
	data, err := json.Marshal(map[string]string{"flag": flag})
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}
	url := fmt.Sprintf("%s/internal_api/world_characters/%s/flags", c.baseURL, worldCharacterDatabaseID)
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Token", c.token)

	res, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("http: %w", err)
	}
	defer func() { _ = res.Body.Close() }()

	if res.StatusCode != http.StatusCreated {
		return fmt.Errorf("rails returned %d", res.StatusCode)
	}
	return nil
}

// ErrQuestRefused is returned by AcceptQuest when Rails refuses the quest
// (already completed, or too many active).
var ErrQuestRefused = errors.New("quest refused")

// AcceptQuest starts a quest for a world character from its definition
// (POST /internal_api/world_characters/:id/quests), returning it as Rails
// stores it. Accepting an active quest returns it unchanged.
func (c *Client) AcceptQuest(worldCharacterDatabaseID string, quest instanceconfig.Quest) (instanceconfig.ActiveQuest, error) {
	url := fmt.Sprintf("%s/internal_api/world_characters/%s/quests", c.baseURL, worldCharacterDatabaseID)
	return c.postQuest(url, quest, http.StatusCreated)
}

// SyncQuest moves a world character's active quest to a newer definition
// (POST .../quests/:quest/sync), keeping progress on unchanged objectives.
func (c *Client) SyncQuest(worldCharacterDatabaseID string, quest instanceconfig.Quest) (instanceconfig.ActiveQuest, error) {
	url := fmt.Sprintf("%s/internal_api/world_characters/%s/quests/%s/sync", c.baseURL, worldCharacterDatabaseID, quest.Identifier)
	return c.postQuest(url, quest, http.StatusOK)
}

func (c *Client) postQuest(url string, quest instanceconfig.Quest, wantStatus int) (instanceconfig.ActiveQuest, error) {
	var none instanceconfig.ActiveQuest
	data, err := json.Marshal(map[string]instanceconfig.Quest{"quest": quest})
	if err != nil {
		return none, fmt.Errorf("marshal: %w", err)
	}
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(data))
	if err != nil {
		return none, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Token", c.token)

	res, err := c.http.Do(req)
	if err != nil {
		return none, fmt.Errorf("http: %w", err)
	}
	defer func() { _ = res.Body.Close() }()

	var body struct {
		Quest instanceconfig.ActiveQuest `json:"quest"`
		Error string                     `json:"error"`
	}
	_ = json.NewDecoder(res.Body).Decode(&body)
	switch res.StatusCode {
	case wantStatus:
		return body.Quest, nil
	case http.StatusUnprocessableEntity:
		return none, fmt.Errorf("%w: %s", ErrQuestRefused, body.Error)
	default:
		return none, fmt.Errorf("rails returned %d", res.StatusCode)
	}
}

// AbandonQuest ends a world character's active quest without completing it
// (DELETE /internal_api/world_characters/:id/quests/:quest). Idempotent.
func (c *Client) AbandonQuest(worldCharacterDatabaseID, questIdentifier string) error {
	url := fmt.Sprintf("%s/internal_api/world_characters/%s/quests/%s", c.baseURL, worldCharacterDatabaseID, questIdentifier)
	req, err := http.NewRequest(http.MethodDelete, url, nil)
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("X-Internal-Token", c.token)

	res, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("http: %w", err)
	}
	defer func() { _ = res.Body.Close() }()

	if res.StatusCode != http.StatusNoContent {
		return fmt.Errorf("rails returned %d", res.StatusCode)
	}
	return nil
}

// QuestProgress sets an active quest's objective counts (by objective
// hash) and, when timerElapsedSeconds isn't nil, its timer (PATCH
// .../quests/:quest), returning the quest as Rails now stores it.
func (c *Client) QuestProgress(worldCharacterDatabaseID, questIdentifier string, progress map[string]int, timerElapsedSeconds *int) (instanceconfig.ActiveQuest, error) {
	var none instanceconfig.ActiveQuest
	body := map[string]any{"progress": progress}
	if timerElapsedSeconds != nil {
		body["timer_elapsed_seconds"] = *timerElapsedSeconds
	}
	url := fmt.Sprintf("%s/internal_api/world_characters/%s/quests/%s", c.baseURL, worldCharacterDatabaseID, questIdentifier)
	var resp struct {
		Quest instanceconfig.ActiveQuest `json:"quest"`
	}
	if err := c.questCall(http.MethodPatch, url, body, http.StatusOK, &resp); err != nil {
		return none, err
	}
	return resp.Quest, nil
}

// CompletedQuest is what completing a quest granted: flags, and the items
// newly held.
type CompletedQuest struct {
	Flags []string `json:"flags"`
	Items []struct {
		Identifier string `json:"identifier"`
		Name       string `json:"name"`
	} `json:"items"`
}

// CompleteQuest completes an active quest (POST .../quests/:quest/complete):
// Rails grants its flags and rewards from the definition it stored.
func (c *Client) CompleteQuest(worldCharacterDatabaseID, questIdentifier string) (CompletedQuest, error) {
	var resp CompletedQuest
	url := fmt.Sprintf("%s/internal_api/world_characters/%s/quests/%s/complete", c.baseURL, worldCharacterDatabaseID, questIdentifier)
	err := c.questCall(http.MethodPost, url, map[string]any{}, http.StatusOK, &resp)
	return resp, err
}

func (c *Client) questCall(method, url string, body any, wantStatus int, out any) error {
	data, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}
	req, err := http.NewRequest(method, url, bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Token", c.token)

	res, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("http: %w", err)
	}
	defer func() { _ = res.Body.Close() }()
	if res.StatusCode != wantStatus {
		return fmt.Errorf("rails returned %d", res.StatusCode)
	}
	if err := json.NewDecoder(res.Body).Decode(out); err != nil {
		return fmt.Errorf("decode: %w", err)
	}
	return nil
}
