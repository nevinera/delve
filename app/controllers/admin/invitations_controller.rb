# System admins list every invitation and whether it's been used, and issue new ones.
class Admin::InvitationsController < ApplicationController
  system_admins_only

  def index
    @invitations = Invitation.order(created_at: :desc).includes(:created_by, :used_by)
  end

  def create
    invitation = Invitations::Issue.call(by: current_user, note: params[:note])
    redirect_to admin_invitations_path, notice: "Invitation made. Send its link to whoever it's for: #{invitation_url(invitation.token)}"
  end
end
