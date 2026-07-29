class InternalApi::CharacterItemsController < InternalApi::BaseController
  rescue_from ActiveRecord::RecordNotFound, with: :render_not_found
  rescue_from ActiveRecord::RecordInvalid, AwardCharacterItem::Error, with: :render_unprocessable

  def create
    character = Character.find(params[:character_id])
    result = AwardCharacterItem.call(character: character, source_data: params.to_unsafe_h)
    case result
    in [CharacterItem => item, :already_owned_other_version]
      render json: {id: item.id, status: "already_owned_other_version"}, status: :created
    in CharacterItem => item
      render json: {id: item.id}, status: :created
    in :already_owned_this_version
      render json: {status: "already_owned_this_version"}, status: :conflict
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
