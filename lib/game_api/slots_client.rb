# frozen_string_literal: true

require_relative "base_client"

module GameApi
  class SlotsClient < BaseClient
    def list(instance_id:)
      get("/instances/#{instance_id}/slots")
    end

    def show(instance_id:, slot_id:)
      get("/instances/#{instance_id}/slots/#{slot_id}")
    end

    # Required: :instance_id, :character_name, :character_class
    def create(attrs)
      validate_attrs(attrs, required: %i[instance_id character_name character_class])
      instance_id = attrs[:instance_id]
      post("/instances/#{instance_id}/slots", attrs.except(:instance_id))
    end

    # Returns nil on success.
    def destroy(instance_id:, slot_id:)
      delete("/instances/#{instance_id}/slots/#{slot_id}")
      nil
    end
  end
end
