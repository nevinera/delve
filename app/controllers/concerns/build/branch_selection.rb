# Index pages that list content from one branch of the content repo: the
# one picked with ?branch=, else the one last picked in any editor or index
# page (the delve_editor_branch cookie, shared with the editors - see
# client/src/github/branchPreference.js), else the default branch. Picking
# one here remembers it the same way. Editors opened from these pages get
# ?branch= too, and start on it.
module Build::BranchSelection
  extend ActiveSupport::Concern

  COOKIE = :delve_editor_branch

  private

  def select_branch(client)
    @branches = client.branch_names
    requested = params[:branch].presence || cookies[COOKIE]
    @branch = @branches.include?(requested) ? requested : client.default_branch
    cookies[COOKIE] = {value: @branch, expires: 1.year, same_site: :lax} if params[:branch].present? && @branch == params[:branch]
  end
end
