# Index pages that list content from one branch of the content repo, picked
# with ?branch= (the default branch otherwise, or for one that doesn't
# exist) - see build/shared/_branch_picker. Editors opened from them get
# the same ?branch=, and start on it.
module Build::BranchSelection
  extend ActiveSupport::Concern

  private

  def select_branch(client)
    @branches = client.branch_names
    @branch = @branches.include?(params[:branch]) ? params[:branch] : client.default_branch
  end
end
