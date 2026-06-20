# frozen_string_literal: true

require_relative "base_client"

module GameApi
  class SlotsClient < BaseClient
    def active
      get("/slots/active")
    end

    # Required: :zone_identifier, :version, :database_id, :source_url,
    #           :zone_config, :character_name, :character_class
    # Optional: :instance_identifier
    #
    # Returns {"instance_identifier", "slot_id", "token"} on success.
    # Raises UnprocessableError on zone mismatch or full instance.
    # Raises ServiceUnavailableError when the server is at instance capacity.
    def request(attrs)
      validate_attrs(attrs,
        required: %i[zone_identifier version database_id source_url zone_config character_name character_class],
        supported: %i[instance_identifier])
      post("/slots/request", attrs)
    end

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
