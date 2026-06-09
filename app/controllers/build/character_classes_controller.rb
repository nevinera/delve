class Build::CharacterClassesController < Build::BaseController
  def index
    authorize! :read, CharacterClass
    @pagy, @character_classes = pagy(:offset, CharacterClass.includes(:handle).order(:identifier))
  end

  def show
    @character_class = CharacterClass.find(params[:id])
    authorize! :read, @character_class
  end

  def new
    @character_class = CharacterClass.new
    @handles = current_user.handles.order(:identifier)
    authorize! :create, CharacterClass
  end

  def create
    @character_class = CharacterClass.new(character_class_params)
    @character_class.user = current_user
    authorize! :create, @character_class
    if @character_class.save
      redirect_to build_character_class_path(@character_class), notice: "Class registered."
    else
      @handles = current_user.handles.order(:identifier)
      render :new, status: :unprocessable_content
    end
  end

  private

  def character_class_params
    params.require(:character_class).permit(:handle_id, :identifier, :version, :location)
  end
end
