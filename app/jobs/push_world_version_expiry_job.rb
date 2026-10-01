# Tells the game server a world version now expires, so its running
# instances count down and kick their players (see WorldVersion#release!).
# Instances started later get expires_at in their slot request instead.
class PushWorldVersionExpiryJob < ApplicationJob
  queue_as :default

  retry_on GameApi::Error, wait: :polynomially_longer, attempts: 10

  def perform(world_version_id)
    version = WorldVersion.find(world_version_id)
    return unless version.expires_at

    GameApi.world_versions.expire(version.id, version.expires_at)
  end
end
