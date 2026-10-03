# The single-page world editor (see plans/world-editor/). Like every other
# content editor, nothing is fetched here - the editor reads and writes the
# content repo from the browser, on whichever branch it's pointed at.
class Build::WorldEditorController < Build::BaseController
  include Build::WorldPublishing

  skip_authorization_check only: :show
  layout "build_world_editor_client"

  def show
    @next_tag = next_tag(Github::ContentClient.new(current_user), params[:id]) # raises (and BaseController redirects) with no repo connected
  end

  # Publish: tags the branch's head - only if it's still the commit the
  # editor expanded (expected_sha), so nothing committed since then is
  # published unvalidated - and records an unreleased version for that
  # tag, which imports itself. Responds with the versions page URL.
  def publish
    key = params[:id]
    tag = params[:tag].to_s.strip
    client = Github::ContentClient.new(current_user)
    world = World.find_or_initialize_by(repo: client.repo, path: World.self_contained_path(key))
    world.owner ||= current_user
    authorize! :manage, world

    error = publish_error(client, tag) || branch_error(client, params[:branch].to_s, params[:expected_sha].to_s)
    return render(json: {error:}, status: :unprocessable_content) if error

    tag_and_record_version(client, world, tag, params[:expected_sha].to_s)
  rescue Github::ApiError => e
    render json: {error: e.message}, status: :unprocessable_content
  end

  private

  def branch_error(client, branch, expected_sha)
    return "A branch and its expanded commit are required." if branch.blank? || expected_sha.blank?
    head = client.branch_sha(branch)
    return if head == expected_sha
    "#{branch} has moved on since it was expanded (now at #{head[0, 7]}); reload, then validate and expand again."
  rescue Github::NotFoundError
    "Branch #{branch} doesn't exist."
  end
end
