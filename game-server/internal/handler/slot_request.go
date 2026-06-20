package handler

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

type slotRequestBody struct {
	ZoneIdentifier     string                        `json:"zone_identifier"`
	Version            string                        `json:"version"`
	DatabaseID         string                        `json:"database_id"`
	SourceURL          string                        `json:"source_url"`
	ZoneConfig         instanceconfig.Zone           `json:"zone_config"`
	InstanceIdentifier string                        `json:"instance_identifier"` // optional
	CharacterName      string                        `json:"character_name"`
	CharacterClass     instanceconfig.CharacterClass `json:"character_class"`
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
	if req.ZoneIdentifier == "" || req.Version == "" || req.DatabaseID == "" ||
		req.SourceURL == "" || req.CharacterName == "" {
		writeError(w, r, http.StatusUnprocessableEntity,
			"zone_identifier, version, database_id, source_url, and character_name are required")
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
	if inst.ZoneIdentifier != req.ZoneIdentifier {
		writeError(w, r, http.StatusUnprocessableEntity, "instance belongs to a different zone")
		return
	}

	h.addSlotAndRespond(w, r, inst, req)
}

func (h *Slots) requestToAnyInstance(w http.ResponseWriter, r *http.Request, req slotRequestBody) {
	inst := instance.SelectBestInstance(h.registry.List(), req.ZoneIdentifier, req.Version)
	if inst == nil {
		if h.registry.Count() >= h.maxInstances {
			writeError(w, r, http.StatusServiceUnavailable, "server is at maximum instance capacity")
			return
		}
		var err error
		inst, err = h.createInstance(req)
		if err != nil {
			writeError(w, r, http.StatusUnprocessableEntity, "failed to start instance: "+err.Error())
			return
		}
	}

	h.addSlotAndRespond(w, r, inst, req)
}

func (h *Slots) createInstance(req slotRequestBody) (*instance.Instance, error) {
	inst := instance.NewInstance(
		uuid.New(),
		req.DatabaseID,
		req.ZoneIdentifier,
		req.Version,
		req.SourceURL,
		req.ZoneConfig,
		h.maxSlots,
	)
	if err := inst.Start(h.registry); err != nil {
		return nil, err
	}
	h.registry.Add(inst)
	return inst, nil
}

func (h *Slots) addSlotAndRespond(w http.ResponseWriter, r *http.Request, inst *instance.Instance, req slotRequestBody) {
	slot, err := inst.AddSlot(req.CharacterName, req.CharacterClass)
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
