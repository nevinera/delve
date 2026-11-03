# The API the game server calls (.agents/formats.md, "Rails and the game server"),
# authenticated with a shared token rather than a signed-in user.
class InternalApi::BaseController < ActionController::API
  LOCAL_TOKEN = "local-internal-token"

  before_action :authenticate_internal_token!

  private

  def authenticate_internal_token!
    token = request.headers["X-Internal-Token"].to_s
    return if token.present? && valid_tokens.any? { |t| ActiveSupport::SecurityUtils.secure_compare(t, token) }

    render json: {error: "unauthorized"}, status: :unauthorized
  end

  def valid_tokens
    raw = ENV.string("INTERNAL_API_TOKENS", default: nil).presence || (Rails.env.local? ? LOCAL_TOKEN : "")
    raw.split(",").filter_map { |t| t.strip.presence }
  end
end
