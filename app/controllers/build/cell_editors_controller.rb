# The cell editor (see plans/cell-editor.md). For now it only shows the
# hand-made example cellmaps bundled with the client, so it needs no repo.
class Build::CellEditorsController < Build::BaseController
  skip_authorization_check only: [:show]
  layout "build_cell_editor_client"

  def show
  end
end
