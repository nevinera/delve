# frozen_string_literal: true

require_relative "base_client"

module GameApi
  class InstancesClient < BaseClient
    def list
      get("/instances")
    end

    def show(id)
      get("/instances/#{id}")
    end

    # Required: :identifier, :database_id, :zone_identifier, :version, :source_url, :zone_config
    def create(attrs)
      validate_attrs(attrs, required: %i[identifier database_id zone_identifier version source_url zone_config])
      post("/instances", attrs)
    end

    # Returns nil on success.
    def destroy(id)
      delete("/instances/#{id}")
      nil
    end
  end
end
