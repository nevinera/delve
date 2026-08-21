class InternalApi::EquippedItemsController < InternalApi::BaseController
  rescue_from ActiveRecord::RecordNotFound, with: :render_not_found

  def index
    character = Character.find(params[:character_id])
    render json: EquippedItems::ForCharacter.call(character: character)
  end

  private

  def render_not_found(err)
    render json: {error: err.message}, status: :not_found
  end
end
