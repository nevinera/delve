# Takes reports from every page's report button (client/src/report/button.js), and lists them for
# system admins, who mark them done.
class ProblemReportsController < ApplicationController
  layout "client_errors"
  rate_limit to: 20, within: 1.hour, only: :create, by: -> { current_user.id }, with: -> { head :too_many_requests }
  before_action :system_admins_only, except: :create
  before_action :find_report, only: [:update, :voice, :screenshot]

  def create
    report = ProblemReport.file!(params.permit(:kind, :note, :page, :build, :details, :voice, :screenshot), user: current_user)
    render json: {id: report.id}, status: :created
  rescue ActiveRecord::RecordInvalid
    head :unprocessable_entity
  end

  def index
    @open = ProblemReport.open.order(created_at: :desc).includes(:user)
    @done = ProblemReport.where.not(done_at: nil).order(done_at: :desc).includes(:user).limit(50)
  end

  def update
    @report.done!
    redirect_to problem_reports_path
  end

  def voice
    return head :not_found unless @report.voice_type && @report.voice_path.exist?
    send_file @report.voice_path, type: @report.voice_type, disposition: "inline"
  end

  def screenshot
    return head :not_found unless @report.screenshot && @report.screenshot_path.exist?
    send_file @report.screenshot_path, type: "image/jpeg", disposition: "inline"
  end

  private

  def find_report
    @report = ProblemReport.find(params[:id])
  end

  def system_admins_only
    head :not_found unless current_user.system_admin?
  end
end
