# Lets the unit type editor (see issue #72) ask the game server how hard a
# draft unit type hits across its mocked gearing plans x relative
# elevations. Same request shape as Build::ValidatorsController#unit_type:
# the resolved (already $ref-free) unit type JSON as the request body. The
# game server itself is Bearer-token protected (only this Rails app calls
# it) - the editor never talks to it directly.
class Build::DpsSimsController < Build::BaseController
  skip_authorization_check only: [:unit_type]

  rescue_from JSON::ParserError do
    render json: {error: "request body must be valid JSON"}, status: :bad_request
  end

  rescue_from Validators::ValidationError do |e|
    render json: {error: e.message, path: e.path}, status: :unprocessable_content
  end

  rescue_from GameApi::UnprocessableError do |e|
    render json: {error: e.message}, status: :unprocessable_content
  end

  rescue_from GameApi::Error, SystemCallError, Net::OpenTimeout, Net::ReadTimeout do |e|
    Rails.logger.error("DPS sim request failed: #{e.class}: #{e.message}")
    render json: {error: "game server unavailable"}, status: :bad_gateway
  end

  def unit_type
    data = JSON.parse(request.body.read)
    Validators::UnitTypeValidator.validate!(data)
    render json: GameApi::DpsSimClient.new.simulate(enemy: data)
  end
end
