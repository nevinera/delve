# The admin page: links to the pages only system admins can see.
class Admin::DashboardController < ApplicationController
  system_admins_only

  def show
    @unused_invitations = Invitation.unused.count
    @open_reports = ProblemReport.open.count
    @error_kinds = ClientError.count
  end
end
