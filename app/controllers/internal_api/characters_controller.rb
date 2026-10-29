# A character as it enters a world: who it is, how it looks, and where it was. Positions aren't
# kept yet, so it always starts at the spawn point.
class InternalApi::CharactersController < InternalApi::BaseController
  def show
    World.find(params[:world_id])
    character = Character.find(params[:id])
    render json: {id: character.id, name: character.name, look: character.look, position: nil}
  end
end
