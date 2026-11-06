# The admin page: links to the pages admins can see. Server admins see invitations, and system
# admins everything else as well.
class Admin::DashboardController < ApplicationController
  server_admins_only

  def show
    @unused_invitations = Invitation.unused.count
    return unless current_user.system_admin?
    @open_reports = ProblemReport.open.count
    @error_kinds = ClientError.count
  end
end
