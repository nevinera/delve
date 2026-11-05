# Pages only system admins can see. Everyone else gets a 404, as if they weren't there.
#
#   class LabController < ApplicationController
#     system_admins_only                  # every action
#     system_admins_only except: :create  # or some of them
#   end
module SystemAdminsOnly
  extend ActiveSupport::Concern

  class_methods do
    def system_admins_only(**only_or_except)
      before_action :require_system_admin, **only_or_except
    end
  end

  private

  def require_system_admin
    head :not_found unless current_user&.system_admin?
  end
end
