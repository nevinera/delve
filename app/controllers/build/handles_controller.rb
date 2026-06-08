class Build::HandlesController < Build::BaseController
  def index
    @handles = current_user.handles.order(:identifier)
    authorize! :read, Handle
  end

  def show
    @handle = current_user.handles.find(params[:id])
    authorize! :read, @handle
  end

  def new
    @handle = current_user.handles.new
    authorize! :create, @handle
  end

  def create
    @handle = current_user.handles.new(handle_params)
    authorize! :create, @handle
    if @handle.save
      redirect_to build_handle_path(@handle), notice: "Handle created."
    else
      render :new, status: :unprocessable_entity
    end
  end

  private

  def handle_params
    params.require(:handle).permit(:identifier, :description)
  end
end
