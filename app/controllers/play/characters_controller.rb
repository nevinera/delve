class Play::CharactersController < Play::BaseController
  def index
    characters = current_user.characters.includes(:character_class, world_characters: [:world_version, :world]).order(:name)
    @characters = most_recently_played_first(characters)
    authorize! :read, Character
  end

  def show
    @character = current_user.characters.includes(character_class: :class_abilities).find(params[:id])
    authorize! :read, @character
  end

  def new
    @character = current_user.characters.new
    @character_classes = fetched_classes
    authorize! :create, @character
  end

  def create
    @character = current_user.characters.new(character_params)
    authorize! :create, @character
    if @character.save
      redirect_to play_character_path(@character), notice: "Character created."
    else
      @character_classes = fetched_classes
      render :new, status: :unprocessable_content
    end
  end

  def edit
    @character = current_user.characters.find(params[:id])
    authorize! :update, @character
    @character_classes = class_choices
  end

  def update
    @character = current_user.characters.find(params[:id])
    authorize! :update, @character
    if @character.update(update_params)
      redirect_to play_character_path(@character), notice: "Character updated."
    else
      @character_classes = class_choices
      render :edit, status: :unprocessable_content
    end
  end

  private

  # Never-played characters last, keeping their name order.
  def most_recently_played_first(characters)
    characters.sort_by.with_index { |character, i| [-(character.last_world_character&.last_played_at.to_f), i] }
  end

  def character_params
    params.require(:character).permit(:name, :character_class_id).merge(token_url: token_value)
  end

  # The class only changes when one is picked (Character blocks it while
  # in a zone).
  def update_params
    params.require(:character).permit(:character_class_id).compact_blank.merge(token_url: token_value)
  end

  def fetched_classes = CharacterClass.available.order(:identifier)

  # Keeps the current class listed even when it isn't available, so saving
  # the token doesn't switch it.
  def class_choices = fetched_classes.or(CharacterClass.where(id: @character.character_class_id_was))

  # A stock token picked in the form becomes ":name:"; "custom" (or no
  # choice) keeps the typed URL.
  def token_value
    choice = params.dig(:character, :token_choice).to_s
    return ":#{choice}:" if choice.present? && choice != "custom"
    params.dig(:character, :token_url).to_s.strip
  end
end
