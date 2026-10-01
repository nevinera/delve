package instance

import (
	"math"
	"time"
)

// VersionExpiryNoticeMinutes is how many minutes before a world version
// expires its players start getting a once-a-minute warning.
const VersionExpiryNoticeMinutes = 10

type versionExpiringMsg struct {
	downBase
	ExpiresAt        int64 `json:"expires_at"` // epoch milliseconds
	MinutesRemaining int   `json:"minutes_remaining"`
}

// SetExpiresAt sets when this instance's world version expires; zero means
// never. Safe to call from any goroutine (Rails moves it while the
// instance runs, when a newer version is released).
func (inst *Instance) SetExpiresAt(t time.Time) {
	inst.expiresMu.Lock()
	defer inst.expiresMu.Unlock()
	inst.expiresAt = t
}

// ExpiresAt returns when this instance's world version expires; zero means
// never.
func (inst *Instance) ExpiresAt() time.Time {
	inst.expiresMu.Lock()
	defer inst.expiresMu.Unlock()
	return inst.expiresAt
}

// expiredAt reports whether the instance's version has expired as of now.
func (inst *Instance) expiredAt(now time.Time) bool {
	exp := inst.ExpiresAt()
	return !exp.IsZero() && !now.Before(exp)
}

// tickExpiry warns every player once a minute for the last
// VersionExpiryNoticeMinutes before the version expires, then at expiry
// tells them and removes every slot. Returns true when the instance has
// expired and should stop. Tick loop only.
func (inst *Instance) tickExpiry(now time.Time) bool {
	exp := inst.ExpiresAt()
	if exp.IsZero() {
		return false
	}
	base := downBase{Direction: "down", Timestamp: now.UnixMilli()}
	if !now.Before(exp) {
		base.Type = "version-expired"
		for _, slot := range inst.ListSlots() {
			inst.sendJSONToSlot(slot.ID, base)
			inst.RemoveSlot(slot.ID)
		}
		return true
	}
	minutes := int(math.Ceil(exp.Sub(now).Minutes()))
	if minutes <= VersionExpiryNoticeMinutes && minutes != inst.lastExpiryNotice {
		inst.lastExpiryNotice = minutes
		base.Type = "version-expiring"
		msg := versionExpiringMsg{downBase: base, ExpiresAt: exp.UnixMilli(), MinutesRemaining: minutes}
		for _, slot := range inst.ListSlots() {
			inst.sendJSONToSlot(slot.ID, msg)
		}
	}
	return false
}
