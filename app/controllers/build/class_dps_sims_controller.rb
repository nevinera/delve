# Lets the class editor (see issue #75) ask the game server how hard a
# draft character class hits across its (elevation x duration) matrix, given
# a caller-authored strategy (priority-list rotation). Same request shape as
# Build::ValidatorsController#character_class for the class itself; strategy
# is calculator-specific (not part of the authored content schema) and isn't
# separately validated here - an unrecognized power name in it is silently
# never cast, not an error, same as the game server's own selectPower.
class Build::ClassDpsSimsController < Build::BaseController
  skip_authorization_check only: [:character_class]

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
    Rails.logger.error("Class DPS sim request failed: #{e.class}: #{e.message}")
    render json: {error: "game server unavailable"}, status: :bad_gateway
  end

  def character_class
    data = JSON.parse(request.body.read)
    Validators::CharacterClassValidator.validate!(data["class"])
    render json: GameApi::ClassDpsSimClient.new.simulate(class: data["class"], strategy: data["strategy"] || [])
  end
end
