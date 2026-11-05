# The admin page: links to the pages only system admins can see.
class AdminController < ApplicationController
  system_admins_only

  def show
    @open_reports = ProblemReport.open.count
    @error_kinds = ClientError.count
  end
end
