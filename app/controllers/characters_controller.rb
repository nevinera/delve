# Your characters: a list, and the character builder to make or change one. The builder saves
# with JSON.
class CharactersController < ApplicationController
  before_action :set_character, only: [:edit, :update, :destroy]

  def index
    @characters = current_user.characters.order(:name)
    @played = WorldCharacter.recent_worlds(@characters)
  end

  def new
    @character = current_user.characters.build
    render :builder, layout: "character_builder"
  end

  def edit
    render :builder, layout: "character_builder"
  end

  def create
    save(current_user.characters.build(character_params), :created)
  end

  def update
    @character.assign_attributes(character_params.except(:name))
    save(@character, :ok)
  end

  def destroy
    @character.destroy
    redirect_to characters_path, notice: "Deleted #{@character.name}."
  end

  private

  def set_character
    @character = current_user.characters.find(params[:id])
  end

  # The look is the builder's JSON as it is: nested settings, lists and colors. The model checks
  # it's an object, and not too large.
  def character_params
    attributes = params.require(:character).permit(:name)
    look = params[:character][:look]
    look.respond_to?(:to_unsafe_h) ? attributes.merge(look: look.to_unsafe_h) : attributes
  end

  def save(character, status)
    if character.save
      render json: {id: character.id, name: character.name, edit_url: edit_character_path(character)}, status:
    else
      render json: {errors: character.errors.full_messages}, status: :unprocessable_content
    end
  end
end
