# Shared error mapping for the class editor's simulator endpoints (class DPS,
# class time-to-die): bad JSON is a 400, an invalid class or a game server
# rejection is a 422, and anything else the game server does wrong is a 502.
module ClassSimErrors
  extend ActiveSupport::Concern

  included do
    skip_authorization_check only: [:character_class]

    rescue_from JSON::ParserError do
      render json: {error: "request body must be valid JSON"}, status: :bad_request
    end

    rescue_from Validators::ValidationError do |e|
      render json: {error: e.message, path: e.path}, status: :unprocessable_content
    end

    rescue_from GameApi::Error, SystemCallError, Net::OpenTimeout, Net::ReadTimeout do |e|
      Rails.logger.error("Class sim request failed: #{e.class}: #{e.message}")
      render json: {error: "game server unavailable"}, status: :bad_gateway
    end

    # Declared after GameApi::Error on purpose: Rails tries handlers last to
    # first, so this narrower one must come later to win for a game server 422.
    rescue_from GameApi::UnprocessableError do |e|
      render json: {error: e.message}, status: :unprocessable_content
    end
  end
end
