# /home, where you land once signed in: your latest characters, and your latest worlds once
# GitHub is connected.
class DashboardController < ApplicationController
  # A world you edit, until worlds have a table of their own (#12).
  FakeWorld = Data.define(:name, :repo, :edited_at)

  def show
    # Most recently changed, until characters record when they were last played (#19).
    @characters = current_user.characters.order(updated_at: :desc).limit(3)
    @character_count = current_user.characters.count
    @github = current_user.github_connection
    @worlds = @github ? fake_worlds : []
  end

  private

  def fake_worlds
    [
      FakeWorld.new(name: "Default world", repo: "#{@github.login}/default-world", edited_at: 2.hours.ago),
      FakeWorld.new(name: "Thornwood", repo: "#{@github.login}/thornwood", edited_at: 3.days.ago),
      FakeWorld.new(name: "The Sunken Coast", repo: "#{@github.login}/sunken-coast", edited_at: 2.weeks.ago)
    ]
  end
end
