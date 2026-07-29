class InternalApi::BaseController < ActionController::API
  before_action :authenticate_internal_token!

  private

  def authenticate_internal_token!
    token = request.headers["X-Internal-Token"]
    return if valid_tokens.include?(token)

    render json: {error: "unauthorized"}, status: :unauthorized
  end

  def valid_tokens
    raw = ENV.fetch("INTERNAL_API_TOKENS", "")
    raw.split(",").filter_map { |t| t.strip.presence }
  end
end
