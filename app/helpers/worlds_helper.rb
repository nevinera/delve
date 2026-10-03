module WorldsHelper
  # The world editor for a world file, or nil for an older-style world
  # (worlds/<key>.json), which the editor can't open.
  def world_editor_path_for(path)
    edit_build_world_path(id: World.key_for(path)) if World.self_contained_path?(path)
  end
end
