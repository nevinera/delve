# /home, where you land once signed in: your latest characters, each with the worlds it played
# last, and your latest worlds once GitHub is connected.
class DashboardController < ApplicationController
  def show
    # Most recently changed, until characters record when they were last played (#19).
    @characters = current_user.characters.order(updated_at: :desc).limit(3)
    @character_count = current_user.characters.count
    @played = played_by(@characters)
    @github = current_user.github_connection
    @worlds = current_user.worlds.order(opened_at: :desc).limit(3)
  end

  private

  # For each character, the released worlds it played most lately, up to RECENT_WORLDS. The game
  # server writes a character's row in a world as it plays there.
  RECENT_WORLDS = 4
  def played_by(characters)
    rows = WorldCharacter.where(character: characters).includes(:world).order(updated_at: :desc)
    rows.select { |row| row.world.released? }.group_by(&:character_id).transform_values { |list| list.first(RECENT_WORLDS).map(&:world) }
  end
end
