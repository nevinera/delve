# Zones on the default branch, for play-testing (Build::ZonePlaysController).
# Zones are edited inside their world now (Build::WorldsController#edit).
class Build::ZonesController < Build::BaseController
  skip_authorization_check only: [:index]

  def index
    entries = Github::ContentClient.new(current_user).list_directory_recursive("zones")
    @zone_keys = ZoneTree.new(entries.map { |entry| entry["path"] }).zone_keys
  end
end
