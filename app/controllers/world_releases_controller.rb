# Releases one of your world's imports: players get its commit the next time they enter. Only an
# import that passed, from a repo that's public now, can be released.
class WorldReleasesController < ApplicationController
  def create
    world = current_user.worlds.find(params[:world_id])
    import = world.imports.find(params.require(:import_id))
    return redirect_to world_path(world), alert: "Only an import that passed can be released." unless import.passed?

    github = current_user.github_connection
    return redirect_to world_path(world), alert: "Connect GitHub to release a world." if github.nil?
    repo = github.api.repo(world.repo)
    return redirect_to world_path(world), alert: "GitHub has no #{world.repo}, or the app can't see it." if repo.nil?
    return redirect_to world_path(world), alert: "#{world.repo} is private. Make it public on GitHub to release it." if repo["private"]

    world.release!(import)
    redirect_to world_path(world), notice: "Released #{import.tag} (#{import.sha.first(7)}). Players get it the next time they enter."
  rescue Github::OauthError => e
    redirect_to world_path(world), alert: "Couldn't check #{world.repo} on GitHub: #{e.message}"
  end
end
