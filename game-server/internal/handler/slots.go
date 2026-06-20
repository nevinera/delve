package handler

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

// Slots handles CRUD operations on slots within a running instance.
type Slots struct {
	registry *instance.Registry
}

func NewSlots(registry *instance.Registry) *Slots {
	return &Slots{registry: registry}
}

type createSlotRequest struct {
	CharacterName  string                        `json:"character_name"`
	CharacterClass instanceconfig.CharacterClass `json:"character_class"`
}

// slotCreateResponse includes the token, which is only returned on creation.
type slotCreateResponse struct {
	ID            string `json:"id"`
	Token         string `json:"token"`
	State         string `json:"state"`
	CharacterName string `json:"character_name"`
}

// slotResponse is used for list and show (no token).
type slotResponse struct {
	ID            string `json:"id"`
	State         string `json:"state"`
	CharacterName string `json:"character_name"`
}

// activeSlotResponse is one entry in the GET /slots/active response. Includes
// the token so Rails can match against slot_sessions.token.
type activeSlotResponse struct {
	InstanceIdentifier string `json:"instance_identifier"`
	SlotID             string `json:"slot_id"`
	Token              string `json:"token"`
	CharacterName      string `json:"character_name"`
	State              string `json:"state"`
}

func slotToCreateResponse(s *instance.InstanceSlot) slotCreateResponse {
	return slotCreateResponse{
		ID:            s.ID.String(),
		Token:         s.Token.String(),
		State:         string(s.State),
		CharacterName: s.CharacterName,
	}
}

func slotToResponse(s *instance.InstanceSlot) slotResponse {
	return slotResponse{
		ID:            s.ID.String(),
		State:         string(s.State),
		CharacterName: s.CharacterName,
	}
}

// Active handles GET /slots/active. Returns all slots across all instances,
// regardless of state. The caller (Rails polling job) uses this to confirm
// which slot sessions are still alive on the go server.
func (h *Slots) Active(w http.ResponseWriter, r *http.Request) {
	instances := h.registry.List()
	result := make([]activeSlotResponse, 0)
	for _, inst := range instances {
		id := inst.Identifier.String()
		for _, s := range inst.ListSlots() {
			result = append(result, activeSlotResponse{
				InstanceIdentifier: id,
				SlotID:             s.ID.String(),
				Token:              s.Token.String(),
				CharacterName:      s.CharacterName,
				State:              string(s.State),
			})
		}
	}
	writeJSON(w, r, http.StatusOK, map[string]any{"slots": result})
}

// Create handles POST /instances/{instanceID}/slots.
func (h *Slots) Create(w http.ResponseWriter, r *http.Request) {
	inst, ok := h.instanceFromURL(w, r)
	if !ok {
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, MaxRequestBytes+1))
	if err != nil {
		writeError(w, r, http.StatusBadRequest, "failed to read request body")
		return
	}
	if int64(len(body)) > MaxRequestBytes {
		writeError(w, r, http.StatusRequestEntityTooLarge, "request body exceeds 4MB limit")
		return
	}

	var req createSlotRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeError(w, r, http.StatusUnprocessableEntity, "invalid request body: "+err.Error())
		return
	}
	if req.CharacterName == "" {
		writeError(w, r, http.StatusUnprocessableEntity, "character_name is required")
		return
	}

	slot, err := inst.AddSlot(req.CharacterName, req.CharacterClass)
	if err != nil {
		if errors.Is(err, instance.ErrInstanceFull) {
			writeError(w, r, http.StatusUnprocessableEntity, err.Error())
			return
		}
		writeError(w, r, http.StatusInternalServerError, "failed to create slot")
		return
	}

	writeJSON(w, r, http.StatusCreated, slotToCreateResponse(slot))
}

// Show handles GET /instances/{instanceID}/slots/{slotID}.
func (h *Slots) Show(w http.ResponseWriter, r *http.Request) {
	inst, ok := h.instanceFromURL(w, r)
	if !ok {
		return
	}
	slotID, ok := slotIDFromURL(w, r)
	if !ok {
		return
	}
	slot, ok := inst.GetSlot(slotID)
	if !ok {
		writeError(w, r, http.StatusNotFound, "slot not found")
		return
	}
	writeJSON(w, r, http.StatusOK, slotToResponse(slot))
}

// List handles GET /instances/{instanceID}/slots.
func (h *Slots) List(w http.ResponseWriter, r *http.Request) {
	inst, ok := h.instanceFromURL(w, r)
	if !ok {
		return
	}
	slots := inst.ListSlots()
	resp := make([]slotResponse, len(slots))
	for i, s := range slots {
		resp[i] = slotToResponse(s)
	}
	writeJSON(w, r, http.StatusOK, map[string]any{"slots": resp})
}

// Destroy handles DELETE /instances/{instanceID}/slots/{slotID}.
func (h *Slots) Destroy(w http.ResponseWriter, r *http.Request) {
	inst, ok := h.instanceFromURL(w, r)
	if !ok {
		return
	}
	slotID, ok := slotIDFromURL(w, r)
	if !ok {
		return
	}
	if !inst.RemoveSlot(slotID) {
		writeError(w, r, http.StatusNotFound, "slot not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Slots) instanceFromURL(w http.ResponseWriter, r *http.Request) (*instance.Instance, bool) {
	id, ok := uuidFromURL(w, r)
	if !ok {
		return nil, false
	}
	inst, ok := h.registry.Get(id)
	if !ok {
		writeError(w, r, http.StatusNotFound, "instance not found")
		return nil, false
	}
	return inst, true
}

func slotIDFromURL(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	raw := chi.URLParam(r, "slotID")
	id, err := uuid.Parse(raw)
	if err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid slot ID: must be a valid UUID")
		return uuid.UUID{}, false
	}
	return id, true
}
