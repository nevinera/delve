module WorldsHelper
  # The editor for a world file: the single-page world editor for a
  # self-contained world, the older world editor otherwise.
  def world_editor_path_for(path)
    key = World.key_for(path)
    World.self_contained_path?(path) ? build_world_editor_path(id: key) : edit_build_world_path(id: key)
  end
end
