# Empties one of your worlds on GitHub (WorldReset).
class WorldResetsController < ApplicationController
  def create
    world = current_user.worlds.find(params[:world_id])
    github = current_user.github_connection
    return redirect_to world_path(world), alert: "Connect GitHub to empty a world." if github.nil?

    sha = WorldReset.new(github.api, world).call
    redirect_to world_path(world), notice: "Emptied #{world.repo} (#{sha.first(7)}). Its old files are still in its history."
  rescue WorldReset::NothingToReset => e
    redirect_to world_path(world), alert: e.message
  rescue Github::OauthError => e
    redirect_to world_path(world), alert: "Couldn't empty #{world.repo} on GitHub: #{e.message}"
  end
end
