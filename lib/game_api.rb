# frozen_string_literal: true

require_relative "game_api/checksum"
require_relative "game_api/instances_client"
require_relative "game_api/slots_client"
require_relative "game_api/world_versions_client"

module GameApi
  def self.instances = InstancesClient.new
  def self.slots = SlotsClient.new
  def self.world_versions = WorldVersionsClient.new
end
