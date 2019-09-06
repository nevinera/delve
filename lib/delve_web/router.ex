defmodule DelveWeb.Router do
  use DelveWeb, :router

  pipeline :api do
    plug :accepts, ["json"]
  end

  scope "/api", DelveWeb do
    pipe_through :api
    resources "/users", UserController, except: [:new, :edit]
  end
end
