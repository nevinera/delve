package handler

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

// MaxRequestBytes is the maximum accepted size for an instance create request
// body. Zone configs are pure JSON (no binary assets), so 4MB is a generous
// ceiling for even the largest zones.
const MaxRequestBytes = 4 * 1024 * 1024

// Instances handles CRUD operations on running game instances.
type Instances struct {
	registry *instance.Registry
	maxSlots int
}

func NewInstances(registry *instance.Registry, maxSlots int) *Instances {
	return &Instances{registry: registry, maxSlots: maxSlots}
}

// createRequest is the body shape for POST /instances.
type createRequest struct {
	Identifier     string         `json:"identifier"`      // Required: UUID string
	DatabaseID     string         `json:"database_id"`     // Required
	ZoneIdentifier string         `json:"zone_identifier"` // Required
	Version        string         `json:"version"`         // Required
	SourceURL      string         `json:"source_url"`      // Required
	ZoneConfig     instanceconfig.Zone `json:"zone_config"`    // Required: fully-resolved zone manifest
}

// instanceResponse is the shape returned for a single instance.
type instanceResponse struct {
	Identifier     string `json:"identifier"`
	DatabaseID     string `json:"database_id"`
	ZoneIdentifier string `json:"zone_identifier"`
	Version        string `json:"version"`
	SourceURL      string `json:"source_url"`
	MaxSlots       int    `json:"max_slots"`
	Status         string `json:"status"`
	CreatedAt      string `json:"created_at"`
}

func instanceToResponse(inst *instance.Instance) instanceResponse {
	return instanceResponse{
		Identifier:     inst.Identifier.String(),
		DatabaseID:     inst.DatabaseID,
		ZoneIdentifier: inst.ZoneIdentifier,
		Version:        inst.Version,
		SourceURL:      inst.SourceURL,
		MaxSlots:       inst.MaxSlots,
		Status:         string(inst.Status),
		CreatedAt:      inst.CreatedAt.UTC().Format("2006-01-02T15:04:05Z"),
	}
}

// Create handles POST /instances.
func (h *Instances) Create(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, MaxRequestBytes+1))
	if err != nil {
		writeError(w, r, http.StatusBadRequest, "failed to read request body")
		return
	}
	if int64(len(body)) > MaxRequestBytes {
		writeError(w, r, http.StatusRequestEntityTooLarge, "request body exceeds 4MB limit")
		return
	}

	var req createRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeError(w, r, http.StatusUnprocessableEntity, "invalid request body: "+err.Error())
		return
	}

	id, err := uuid.Parse(req.Identifier)
	if err != nil {
		writeError(w, r, http.StatusUnprocessableEntity, "invalid identifier: must be a valid UUID")
		return
	}

	if req.DatabaseID == "" || req.ZoneIdentifier == "" || req.Version == "" || req.SourceURL == "" {
		writeError(w, r, http.StatusUnprocessableEntity, "database_id, zone_identifier, version, and source_url are required")
		return
	}

	inst := instance.NewInstance(id, req.DatabaseID, req.ZoneIdentifier, req.Version, req.SourceURL, req.ZoneConfig, h.maxSlots)
	if err := inst.Start(); err != nil {
		writeError(w, r, http.StatusUnprocessableEntity, "failed to start instance: "+err.Error())
		return
	}
	h.registry.Add(inst)

	writeJSON(w, r, http.StatusCreated, instanceToResponse(inst))
}

// Show handles GET /instances/{instanceID}.
func (h *Instances) Show(w http.ResponseWriter, r *http.Request) {
	inst, ok := h.instanceFromURL(w, r)
	if !ok {
		return
	}
	writeJSON(w, r, http.StatusOK, instanceToResponse(inst))
}

// Destroy handles DELETE /instances/{instanceID}.
func (h *Instances) Destroy(w http.ResponseWriter, r *http.Request) {
	id, ok := uuidFromURL(w, r)
	if !ok {
		return
	}
	inst, exists := h.registry.Get(id)
	if !exists {
		writeError(w, r, http.StatusNotFound, "instance not found")
		return
	}
	inst.Stop()
	h.registry.Remove(id)
	w.WriteHeader(http.StatusNoContent)
}

// List handles GET /instances.
func (h *Instances) List(w http.ResponseWriter, r *http.Request) {
	instances := h.registry.List()
	resp := make([]instanceResponse, len(instances))
	for i, inst := range instances {
		resp[i] = instanceToResponse(inst)
	}
	writeJSON(w, r, http.StatusOK, map[string]any{"instances": resp})
}

// instanceFromURL resolves the {instanceID} URL parameter to a live instance,
// writing an appropriate error response and returning false if not found.
func (h *Instances) instanceFromURL(w http.ResponseWriter, r *http.Request) (*instance.Instance, bool) {
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

func uuidFromURL(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	raw := chi.URLParam(r, "instanceID")
	id, err := uuid.Parse(raw)
	if err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid instance ID: must be a valid UUID")
		return uuid.UUID{}, false
	}
	return id, true
}

// writeJSON serializes v as JSON and writes it with the given status code.
func writeJSON(w http.ResponseWriter, r *http.Request, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.ErrorContext(r.Context(), "failed to encode response", "err", err)
	}
}

// writeError writes a JSON error response.
func writeError(w http.ResponseWriter, r *http.Request, status int, msg string) {
	writeJSON(w, r, status, map[string]string{"error": msg})
}
