# The creatures page: each body the client builds, playing every clip a creature has, grouped by
# skeleton. The creature page: one creature playing each of its roles, with its look's settings.
class CreaturesController < ApplicationController
  layout "creatures"

  def show
  end

  def creature
    render layout: "creature"
  end
end
