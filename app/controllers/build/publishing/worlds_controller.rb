# World *records* (a world file in a repo that can have published
# versions), as opposed to Build::WorldsController, which edits the world
# file's content.
class Build::Publishing::WorldsController < Build::BaseController
  def index
    authorize! :read, World
    @worlds = current_user.worlds.order(:repo, :path)
  end

  def show
    @world = current_user.worlds.find(params[:id])
    authorize! :read, @world
    @versions = @world.world_versions.order(created_at: :desc)
  end

  # Sets up publishing for a world file in the user's linked repo; a no-op
  # (beyond the redirect) when it's already set up.
  def create
    world = world_for(params[:path].to_s)
    authorize! :manage, world
    if world.save
      redirect_to build_publishing_world_path(world)
    else
      redirect_to build_worlds_path, alert: "Couldn't set up publishing: #{world.errors.full_messages.to_sentence}"
    end
  end

  private

  def world_for(path)
    World.find_or_initialize_by(repo: Github::ContentClient.new(current_user).repo, path:).tap do |world|
      world.owner ||= current_user
    end
  end
end
