class Play::CharacterSettingsController < Play::BaseController
  before_action :load_character

  def show
    setting = @character.setting_or_default
    authorize! :read, setting
    render json: setting.as_client_json
  end

  def update
    setting = @character.setting_or_default
    authorize! :update, setting
    if setting.update(setting_params)
      render json: setting.as_client_json
    else
      render json: {errors: setting.errors.to_hash}, status: :unprocessable_content
    end
  end

  private

  def load_character
    @character = current_user.characters.find(params[:character_id])
  end

  def setting_params
    params.expect(setting: [:joystick_sensitivity, ability_button_map: {}, custom_hotkeys: {}])
  end
end
