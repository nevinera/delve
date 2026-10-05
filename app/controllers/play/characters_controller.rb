class Play::CharactersController < Play::BaseController
  def index
    @characters = current_user.characters.includes(:character_class).order(:name)
    authorize! :read, Character
  end

  def show
    @character = current_user.characters.includes(character_class: :class_abilities).find(params[:id])
    authorize! :read, @character
  end

  def new
    @character = current_user.characters.new
    @character_classes = CharacterClass.where(state: :fetched).order(:identifier)
    authorize! :create, @character
  end

  def create
    @character = current_user.characters.new(character_params)
    authorize! :create, @character
    if @character.save
      redirect_to play_character_path(@character), notice: "Character created."
    else
      @character_classes = CharacterClass.where(state: :fetched).order(:identifier)
      render :new, status: :unprocessable_content
    end
  end

  def edit
    @character = current_user.characters.find(params[:id])
    authorize! :update, @character
  end

  def update
    @character = current_user.characters.find(params[:id])
    authorize! :update, @character
    if @character.update(token_url_params)
      redirect_to play_character_path(@character), notice: "Token updated."
    else
      render :edit, status: :unprocessable_content
    end
  end

  private

  def character_params
    params.require(:character).permit(:name, :character_class_id).merge(token_url: token_value)
  end

  def token_url_params
    {token_url: token_value}
  end

  # A stock token picked in the form becomes ":name:"; "custom" (or no
  # choice) keeps the typed URL.
  def token_value
    choice = params.dig(:character, :token_choice).to_s
    return ":#{choice}:" if choice.present? && choice != "custom"
    params.dig(:character, :token_url).to_s.strip
  end
end
