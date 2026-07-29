class InternalApi::CharacterItemsController < InternalApi::BaseController
  rescue_from ActiveRecord::RecordNotFound, with: :render_not_found
  rescue_from ActiveRecord::RecordInvalid, AwardCharacterItem::Error, with: :render_unprocessable

  def create
    character = Character.find(params[:character_id])
    item = AwardCharacterItem.call(character: character, source_data: params.to_unsafe_h)
    if item
      render json: {id: item.id}, status: :created
    else
      render json: {error: "Item already held"}, status: :ok
    end
  end

  private

  def render_not_found(err)
    render json: {error: err.message}, status: :not_found
  end

  def render_unprocessable(err)
    render json: {error: err.message}, status: :unprocessable_content
  end
end
