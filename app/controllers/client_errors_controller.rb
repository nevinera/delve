# Takes errors pages report (client/src/errors/recorder.js), and lists them for system admins.
class ClientErrorsController < ApplicationController
  layout "client_errors"
  rate_limit to: 60, within: 1.minute, only: :create, by: -> { current_user.id }, with: -> { head :too_many_requests }
  system_admins_only only: :index

  def create
    report = params.require(:error).permit(:message, :page, :stack, :build, details: {}).to_h.symbolize_keys
    ClientError.record!(report, user: current_user)
    head :no_content
  end

  def index
    @errors = ClientError.order(last_seen_at: :desc).includes(:user).limit(200)
  end
end
