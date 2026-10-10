package handler

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

type slotRequestBody struct {
	ZoneIdentifier      string                                 `json:"zone_identifier"`
	Version             string                                 `json:"version"`
	DatabaseID          string                                 `json:"database_id"`
	SourceURL           string                                 `json:"source_url"`
	ZoneConfig          instanceconfig.Zone                    `json:"zone_config"`
	InstanceIdentifier  string                                 `json:"instance_identifier"` // optional
	CharacterName       string                                 `json:"character_name"`
	CharacterDatabaseID string                                 `json:"character_database_id"`
	CharacterClass      instanceconfig.CharacterClass          `json:"character_class"`
	OwnedZoneItems      map[string]bool                        `json:"owned_zone_items"` // optional; nil if not provided
	EquippedItems       map[string]instanceconfig.EquippedItem `json:"equipped_items"`   // optional; nil if not provided
	HeldFlags           []string                               `json:"held_flags"`       // optional; the zone's listed flags the character holds
	ActiveQuests        []instanceconfig.ActiveQuest           `json:"active_quests"`    // optional; the character's active quests in the world
	TokenImageURL       string                                 `json:"token_image_url"`  // optional; the character's portrait

	// How the player reached the zone, and the world-join settings (see
	// game-server/README.md).
	Mode                     instance.Mode                         `json:"mode"`                        // world | direct; required
	InstanceKey              string                                `json:"instance_key"`                // Rails-chosen key; selection matches on it; required
	SpawnAt                  string                                `json:"spawn_at"`                    // "mapId/connectionId"; per slot
	Exits                    []string                              `json:"exits"`                       // "mapId/connectionId" keys; per instance
	WorldCharacterDatabaseID string                                `json:"world_character_database_id"` // required for world mode
	WorldVersionID           string                                `json:"world_version_id"`            // per instance
	Provenance               instanceconfig.ProvenanceRestrictions `json:"provenance_restrictions"`     // per instance
	ExpiresAt                *time.Time                            `json:"expires_at"`                  // RFC 3339; per instance, if the version is already expiring
	QuestsURL                string                                `json:"quests_url"`                  // per instance; the world's quests file, if it has one
	QuestsSHA                string                                `json:"quests_sha"`                  // per instance; its SHA1
}

// validate checks required fields, returning a message for the first
// problem found.
func (req *slotRequestBody) validate() string {
	switch req.Mode {
	case instance.ModeWorld, instance.ModeDirect:
	default:
		return "mode must be world or direct"
	}
	// A direct join has no zone record, so no database_id.
	if req.ZoneIdentifier == "" || req.Version == "" || (req.DatabaseID == "" && req.Mode != instance.ModeDirect) ||
		req.SourceURL == "" || req.CharacterName == "" || req.CharacterDatabaseID == "" {
		return "zone_identifier, version, database_id, source_url, character_name, and character_database_id are required"
	}
	if req.Mode == instance.ModeWorld && req.WorldCharacterDatabaseID == "" {
		return "world_character_database_id is required for world mode"
	}
	if req.InstanceKey == "" {
		return "instance_key is required"
	}
	return ""
}

type slotRequestResponse struct {
	InstanceIdentifier string `json:"instance_identifier"`
	SlotID             string `json:"slot_id"`
	Token              string `json:"token"`
}

// Request handles POST /slots/request. It finds or creates a suitable instance
// for the zone and adds a slot for the character, returning the slot token.
func (h *Slots) Request(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, MaxRequestBytes+1))
	if err != nil {
		writeError(w, r, http.StatusBadRequest, "failed to read request body")
		return
	}
	if int64(len(body)) > MaxRequestBytes {
		writeError(w, r, http.StatusRequestEntityTooLarge, "request body exceeds 4MB limit")
		return
	}

	var req slotRequestBody
	if err := json.Unmarshal(body, &req); err != nil {
		writeError(w, r, http.StatusUnprocessableEntity, "invalid request body: "+err.Error())
		return
	}
	if msg := req.validate(); msg != "" {
		writeError(w, r, http.StatusUnprocessableEntity, msg)
		return
	}

	if req.InstanceIdentifier != "" {
		h.requestToSpecificInstance(w, r, req)
	} else {
		h.requestToAnyInstance(w, r, req)
	}
}

func (h *Slots) requestToSpecificInstance(w http.ResponseWriter, r *http.Request, req slotRequestBody) {
	id, err := uuid.Parse(req.InstanceIdentifier)
	if err != nil {
		writeError(w, r, http.StatusUnprocessableEntity, "invalid instance_identifier: must be a valid UUID")
		return
	}

	inst, ok := h.registry.Get(id)
	if !ok {
		writeError(w, r, http.StatusNotFound, "instance not found")
		return
	}
	if inst.ZoneIdentifier != req.ZoneIdentifier || inst.Mode != req.Mode || inst.InstanceKey != req.InstanceKey {
		writeError(w, r, http.StatusUnprocessableEntity, "instance belongs to a different zone")
		return
	}

	h.addSlotAndRespond(w, r, inst, req)
}

func (h *Slots) requestToAnyInstance(w http.ResponseWriter, r *http.Request, req slotRequestBody) {
	inst := instance.SelectKeyedInstance(h.registry.List(), req.Mode, req.InstanceKey)
	if inst == nil {
		if h.registry.Count() >= h.maxInstances {
			writeError(w, r, http.StatusNotAcceptable, "server is at maximum instance capacity")
			return
		}
		var err error
		inst, err = h.createInstance(r, req)
		if err != nil {
			writeError(w, r, http.StatusUnprocessableEntity, "failed to start instance: "+err.Error())
			return
		}
	}

	h.addSlotAndRespond(w, r, inst, req)
}

// loadQuests returns the world's quests, or none (logging why) if they
// can't be read: a quest-less zone beats one nobody can enter.
func (h *Slots) loadQuests(ctx context.Context, req slotRequestBody) []instanceconfig.Quest {
	if req.QuestsURL == "" {
		return nil
	}
	quests, err := h.questBook.Load(req.QuestsURL, req.QuestsSHA)
	if err != nil {
		slog.WarnContext(ctx, "failed to load quests; the zone will offer none", "error", err, "zone", req.ZoneIdentifier)
		return nil
	}
	return quests
}

func (h *Slots) createInstance(r *http.Request, req slotRequestBody) (*instance.Instance, error) {
	inst := instance.NewInstance(
		uuid.New(),
		req.DatabaseID,
		req.ZoneIdentifier,
		req.Version,
		req.SourceURL,
		req.ZoneConfig,
		h.maxSlots,
	)
	inst.RailsClient = h.railsClient
	inst.Mode = req.Mode
	inst.InstanceKey = req.InstanceKey
	inst.WorldVersionID = req.WorldVersionID
	inst.Provenance = req.Provenance
	inst.Exits = make(map[string]bool, len(req.Exits))
	for _, key := range req.Exits {
		inst.Exits[key] = true
	}
	if req.ExpiresAt != nil {
		inst.SetExpiresAt(*req.ExpiresAt)
	}
	inst.Quests = h.loadQuests(r.Context(), req)
	if err := inst.Start(h.registry); err != nil {
		return nil, err
	}
	h.registry.Add(inst)
	return inst, nil
}

func (h *Slots) addSlotAndRespond(w http.ResponseWriter, r *http.Request, inst *instance.Instance, req slotRequestBody) {
	slot, err := inst.AddSlotWithOptions(req.CharacterName, req.CharacterDatabaseID, req.CharacterClass, req.OwnedZoneItems, req.EquippedItems, instance.SlotOptions{
		WorldCharacterDatabaseID: req.WorldCharacterDatabaseID,
		SpawnAt:                  req.SpawnAt,
		HeldFlags:                req.HeldFlags,
		ActiveQuests:             req.ActiveQuests,
		TokenImageURL:            req.TokenImageURL,
	})
	if err != nil {
		if errors.Is(err, instance.ErrInstanceFull) {
			writeError(w, r, http.StatusUnprocessableEntity, err.Error())
			return
		}
		writeError(w, r, http.StatusInternalServerError, "failed to add slot")
		return
	}

	writeJSON(w, r, http.StatusCreated, slotRequestResponse{
		InstanceIdentifier: inst.Identifier.String(),
		SlotID:             slot.ID.String(),
		Token:              slot.Token.String(),
	})
}
