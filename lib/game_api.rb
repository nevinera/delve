# frozen_string_literal: true

require_relative "game_api/instances_client"
require_relative "game_api/slots_client"

module GameApi
  def self.instances = InstancesClient.new
  def self.slots = SlotsClient.new
end
