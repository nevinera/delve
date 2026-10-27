# The object and structure libraries on their own pages: the same libraries as the world editor's,
# kept in the browser.
class ObjectsController < ApplicationController
  layout "objects"

  def show
    @kind = "objects"
  end

  def structures
    @kind = "structures"
    render :show
  end
end
