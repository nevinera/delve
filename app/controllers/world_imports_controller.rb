# Starts importing a published version of one of your worlds (ImportWorldJob).
class WorldImportsController < ApplicationController
  def create
    world = current_user.worlds.find(params[:world_id])
    tag = params.require(:tag)
    if world.imports.where(tag:, status: %w[queued running]).exists?
      return redirect_to world_path(world), alert: "#{tag} is already being imported."
    end

    ImportWorldJob.perform_later(world.imports.create!(tag:))
    redirect_to world_path(world), notice: "Importing #{tag}."
  end
end
