# Playing a released world: pick one of your characters, then enter at the world's spawn point.
# Anyone signed in can play any released world.
class PlayController < ApplicationController
  # The game's own layout is for entering, not for picking a character.
  layout "application"

  def show
    @world = World.where.not(released_sha: nil).find(params[:id])
    @characters = current_user.characters.order(:name)
    return render :pick unless params[:character]

    @character = @characters.find(params[:character])
    import = @world.imports.find_by(sha: @world.released_sha, status: "passed")
    return redirect_to play_path(@world), alert: "#{@world.display_name}'s release can't be found." if import.nil?

    @config = {repo: @world.repo, sha: @world.released_sha, paths: import.files.keys, look: @character.look}
    render :show, layout: "play"
  end
end
