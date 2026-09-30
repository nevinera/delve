class Build::Registration::ZonesController < Build::BaseController
  def index
    authorize! :read, Zone
    @pagy, @zones = pagy(:offset, Zone.legacy.order(:identifier, :version))
  end

  def show
    @zone = Zone.legacy.find(params[:id])
    authorize! :read, @zone
  end

  def new
    @zone = Zone.new
    authorize! :create, Zone
  end

  def create
    @zone = Zone.new(zone_params)
    @zone.registering_user = current_user
    authorize! :create, @zone
    if @zone.save
      redirect_to build_registration_zone_path(@zone), notice: "Zone registered."
    else
      render :new, status: :unprocessable_content
    end
  end

  private

  def zone_params
    params.require(:zone).permit(:identifier, :version, :name, :description, :config_url)
  end
end
