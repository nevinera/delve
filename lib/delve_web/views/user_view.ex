defmodule DelveWeb.UserView do
  use DelveWeb, :view
  alias DelveWeb.UserView

  def render("index.json", %{users: users}) do
    %{data: render_many(users, UserView, "user.json")}
  end

  def render("show.json", %{user: user}) do
    %{data: render_one(user, UserView, "user.json")}
  end

  def render("user.json", %{user: user}) do
    %{id: user.id, email: user.email, username: user.username}
  end

  def render("sign_in.json", %{user: user}) do
    user_data = %{ id: user.id, email: user.email }
    %{data: %{ user: user_data }}
  end
end
