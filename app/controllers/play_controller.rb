# Playing a world: pick one of your characters, then enter at the world's spawn point. Anyone signed
# in can play any released world. A world's owner can also preview an import that passed, before
# releasing it (?import=), and only they can.
class PlayController < ApplicationController
  # The game's own layout is for entering, not for picking a character.
  layout "application"

  def show
    @world = World.find(params[:id])
    @preview = preview_import
    raise ActiveRecord::RecordNotFound unless @preview || @world.released?

    @characters = current_user.characters.order(:name)
    return render :pick unless params[:character]

    @character = @characters.find(params[:character])
    import = @preview || @world.imports.find_by(sha: @world.released_sha, status: "passed")
    return redirect_to play_path(@world), alert: "#{@world.display_name}'s release can't be found." if import.nil?

    @config = {
      repo: @world.repo, sha: import.sha, paths: import.files.keys, look: @character.look,
      game: {url: Game::EntryToken.server_url, token: Game::EntryToken.issue(character: @character, world: @world, sha: import.sha)}
    }
    render :show, layout: "play"
  end

  private

  # The import ?import= asks to preview: one of the owner's that passed.
  def preview_import
    return if params[:import].blank?
    raise ActiveRecord::RecordNotFound unless @world.user == current_user
    @world.imports.find_by!(id: params[:import], status: "passed")
  end
end
