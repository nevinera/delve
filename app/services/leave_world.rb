# Takes a character out of a world on purpose: removes their game-server
# slot (despawning their unit and closing the client's socket) and their
# SlotSession, so they can switch versions or re-enter straight away instead
# of waiting out the server's reconnect window. A no-op if they aren't in
# this world.
class LeaveWorld
  def self.call(...) = new(...).call

  def initialize(character:, world:)
    @character = character
    @world = world
  end

  def call
    session = SlotSession.find_by(character: @character)
    return unless session&.zone&.world_version&.world_id == @world.id

    remove_slot(session)
    session.destroy!
  end

  private

  def remove_slot(session)
    GameApi.slots.destroy(instance_id: session.instance_identifier, slot_id: session.slot_id)
  rescue GameApi::NotFoundError
    # Already gone (pruned, or the instance shut down).
  end
end
