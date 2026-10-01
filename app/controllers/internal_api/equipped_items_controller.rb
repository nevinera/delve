class InternalApi::EquippedItemsController < InternalApi::BaseController
  rescue_from ActiveRecord::RecordNotFound, with: :render_not_found

  def index
    world_character = WorldCharacter.find(params[:world_character_id])
    render json: EquippedItems::ForWorldCharacter.call(world_character:)
  end

  private

  def render_not_found(err)
    render json: {error: err.message}, status: :not_found
  end
end
