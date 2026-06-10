# frozen_string_literal: true

require_relative "game_api/instances_client"

module GameApi
  def self.instances = InstancesClient.new
end
