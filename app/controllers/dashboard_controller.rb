# /home, where you land once signed in: your latest characters, each with the worlds it played
# last, and your latest worlds once GitHub is connected.
class DashboardController < ApplicationController
  def show
    # Most recently changed, until characters record when they were last played (#19).
    @characters = current_user.characters.order(updated_at: :desc).limit(3)
    @character_count = current_user.characters.count
    @played = WorldCharacter.recent_worlds(@characters)
    @github = current_user.github_connection
    @worlds = current_user.worlds.order(opened_at: :desc).limit(3)
  end
end
