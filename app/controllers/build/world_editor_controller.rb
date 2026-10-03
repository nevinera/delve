# The single-page world editor (see plans/world-editor/). Like every other
# content editor, nothing is fetched here - the editor reads and writes the
# content repo from the browser, on whichever branch it's pointed at.
class Build::WorldEditorController < Build::BaseController
  skip_authorization_check only: :show
  layout "build_world_editor_client"

  def show
    Github::ContentClient.new(current_user) # raises (and BaseController redirects) if there's no repo connected yet
  end
end
