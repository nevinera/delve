defmodule DelveWeb.UserControllerTest do
  use DelveWeb.ConnCase

  alias Delve.Auth
  alias Delve.Auth.User

  @create_attrs %{
    email: "some email",
    password: "some password",
    username: "some username"
  }
  @update_attrs %{
    email: "some updated email",
    password: "some updated password",
    username: "some updated username"
  }
  @invalid_attrs %{email: nil, password: nil, username: nil}

  def fixture(:user) do
    {:ok, user} = Auth.create_user(@create_attrs)
    user
  end

  setup %{conn: conn} do
    {:ok, conn: put_req_header(conn, "accept", "application/json")}
  end

  describe "index" do
    test "lists all users", %{conn: conn} do
      conn = get(conn, Routes.user_path(conn, :index))
      assert json_response(conn, 200)["data"] == []
    end
  end

  describe "create user" do
    test "renders user when data is valid", %{conn: conn} do
      conn = post(conn, Routes.user_path(conn, :create), user: @create_attrs)
      assert %{"id" => id} = json_response(conn, 201)["data"]

      conn = get(conn, Routes.user_path(conn, :show, id))

      assert %{
               "id" => id,
               "email" => "some email",
               "username" => "some username"
             } = json_response(conn, 200)["data"]
    end

    test "renders errors when data is invalid", %{conn: conn} do
      conn = post(conn, Routes.user_path(conn, :create), user: @invalid_attrs)
      assert json_response(conn, 422)["errors"] != %{}
    end
  end

  describe "update user" do
    setup [:create_user]

    test "renders user when data is valid", %{conn: conn, user: %User{id: id} = user} do
      conn = put(conn, Routes.user_path(conn, :update, user), user: @update_attrs)
      assert %{"id" => ^id} = json_response(conn, 200)["data"]

      conn = get(conn, Routes.user_path(conn, :show, id))

      assert %{
               "id" => id,
               "email" => "some updated email",
               "username" => "some updated username"
             } = json_response(conn, 200)["data"]
    end

    test "renders errors when data is invalid", %{conn: conn, user: user} do
      conn = put(conn, Routes.user_path(conn, :update, user), user: @invalid_attrs)
      assert json_response(conn, 422)["errors"] != %{}
    end
  end

  describe "delete user" do
    setup [:create_user]

    test "deletes chosen user", %{conn: conn, user: user} do
      conn = delete(conn, Routes.user_path(conn, :delete, user))
      assert response(conn, 204)

      assert_error_sent 404, fn ->
        get(conn, Routes.user_path(conn, :show, user))
      end
    end
  end

  describe "sign-in user" do
    setup [:create_user]
    
    test "succeeds with good credentials", %{conn: conn, user: user} do
      params = %{email: "some email", password: "some password"}
      conn = post(conn, Routes.user_path(conn, :sign_in), params)

      expected_user_data = %{"id" => user.id, "email" => user.email}
      expected_response_data = %{"data" => %{ "user" => expected_user_data}}
      assert json_response(conn, 200) == expected_response_data
    end

    test "fails with bad password", %{conn: conn} do
      params = %{email: "some email", password: "wrong password"}
      conn = post(conn, Routes.user_path(conn, :sign_in), params)
      assert response(conn, 401)
      assert json_response(conn, 401)["errors"]["detail"] =~ ~r/password/
    end

    test "fails with unrecognized user", %{conn: conn} do
      params = %{email: "wrong email", password: "some password"}
      conn = post(conn, Routes.user_path(conn, :sign_in), params)
      assert response(conn, 401)
      assert json_response(conn, 401)["errors"]["detail"] =~ ~r/password/
    end
  end

  defp create_user(_) do
    user = fixture(:user)
    {:ok, user: user}
  end
end
