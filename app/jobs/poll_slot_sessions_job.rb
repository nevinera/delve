class PollSlotSessionsJob < ApplicationJob
  queue_as :default

  STALE_THRESHOLD = 10.minutes

  def perform
    active_tokens = Set.new(GameApi.slots.active.fetch("slots", []).pluck("token"))
    SlotSession.where(token: active_tokens.to_a).update_all(last_confirmed_at: Time.current)
    stale_sessions.destroy_all
  end

  private

  def stale_sessions
    SlotSession.where(id: stale_by_confirmed).or(SlotSession.where(id: stale_by_age))
  end

  def stale_by_confirmed
    SlotSession.where.not(last_confirmed_at: nil).where(last_confirmed_at: ..STALE_THRESHOLD.ago)
  end

  def stale_by_age
    SlotSession.where(last_confirmed_at: nil).where(created_at: ..STALE_THRESHOLD.ago)
  end
end
