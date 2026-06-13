class Play::CharactersController < Play::BaseController
  def index
    @characters = current_user.characters.includes(character_class: :handle).order(:name)
    authorize! :read, Character
  end

  def show
    @character = current_user.characters.find(params[:id])
    authorize! :read, @character
  end

  def new
    @character = current_user.characters.new
    @character_classes = CharacterClass.where(state: :fetched).includes(:handle).order(:identifier)
    authorize! :create, @character
  end

  def create
    @character = current_user.characters.new(character_params)
    authorize! :create, @character
    if @character.save
      redirect_to play_character_path(@character), notice: "Character created."
    else
      @character_classes = CharacterClass.where(state: :fetched).includes(:handle).order(:identifier)
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
    params.require(:character).permit(:name, :character_class_id, :token_url)
  end

  def token_url_params
    params.require(:character).permit(:token_url)
  end
end
