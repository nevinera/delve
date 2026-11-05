# The monster lab, for looking over creature bodies: any body, several looks of it side by side,
# playing any of its clips at any speed.
class MonsterLabController < ApplicationController
  layout "monster_lab"
  system_admins_only

  def show
  end
end
