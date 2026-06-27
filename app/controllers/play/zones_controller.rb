class Play::ZonesController < Play::BaseController
  layout "game_client"

  def show
    @character = current_user.characters.find(params[:character_id])
    authorize! :read, @character
    @zone = Zone.find(params[:id])
    @result = JoinZone.call(character: @character, zone: @zone)
  end
end
