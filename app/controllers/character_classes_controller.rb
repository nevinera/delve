class CharacterClassesController < ApplicationController
  def index
    @pagy, @character_classes = pagy(:offset, CharacterClass.order(:identifier))
  end

  def show
    @character_class = CharacterClass.find(params[:id])
  end

  def new
    @character_class = CharacterClass.new
    @handles = current_user.handles.order(:identifier)
  end

  def create
    @character_class = current_user.character_classes.new(
      identifier: params[:character_class][:identifier],
      handle_id: params[:character_class][:handle_id]
    )
    @character_class.location = params[:character_class][:location]

    definition_json = fetch_definition(@character_class.location)
    if definition_json.nil?
      @character_class.errors.add(:location, "could not be fetched")
      @handles = current_user.handles.order(:identifier)
      return render :new, status: :unprocessable_entity
    end

    @character_class.definition = definition_json

    if @character_class.save
      redirect_to @character_class, notice: "Class registered."
    else
      @handles = current_user.handles.order(:identifier)
      render :new, status: :unprocessable_entity
    end
  end

  private

  def fetch_definition(url)
    uri = URI.parse(url)
    response = Net::HTTP.get_response(uri)
    return nil unless response.is_a?(Net::HTTPSuccess)
    JSON.parse(response.body)
  rescue URI::InvalidURIError, SocketError, JSON::ParserError
    nil
  end
end
