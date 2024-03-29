defmodule Delve.AuthTest do
  use Delve.DataCase

  alias Delve.Auth

  describe "users" do
    alias Delve.Auth.User

    @valid_attrs %{email: "some email", username: "some username", password: "fake password"}
    @update_attrs %{email: "some updated email", username: "some updated username", password: "new password"}
    @invalid_attrs %{email: nil, username: nil, password: nil}

    def user_fixture(attrs \\ %{}) do
      {:ok, user} =
        attrs
        |> Enum.into(@valid_attrs)
        |> Auth.create_user()

      user
    end

    test "list_users/0 returns all users" do
      user = user_fixture()
      assert Auth.list_users() == [%User{user | password: nil}]
    end

    test "get_user!/1 returns the user with given id" do
      user = user_fixture()
      assert Auth.get_user!(user.id) == %User{user | password: nil}
    end

    test "create_user/1 with valid data creates a user" do
      assert {:ok, %User{} = user} = Auth.create_user(@valid_attrs)
      assert user.email == "some email"
      assert user.username == "some username"
      assert Bcrypt.verify_pass("fake password", user.password_hash)
    end

    test "create_user/1 with invalid data returns error changeset" do
      assert {:error, %Ecto.Changeset{}} = Auth.create_user(@invalid_attrs)
    end

    test "update_user/2 with valid data updates the user" do
      user = user_fixture()
      assert {:ok, %User{} = user} = Auth.update_user(user, @update_attrs)
      assert user.email == "some updated email"
      assert user.username == "some updated username"
      assert user.password_hash != nil
      assert Bcrypt.verify_pass("new password", user.password_hash)
    end

    test "update_user/2 with invalid data returns error changeset" do
      user = user_fixture()
      assert {:error, %Ecto.Changeset{}} = Auth.update_user(user, @invalid_attrs)
      assert %User{user | password: nil} == Auth.get_user!(user.id)
      assert Bcrypt.verify_pass("fake password", user.password_hash)
    end

    test "delete_user/1 deletes the user" do
      user = user_fixture()
      assert {:ok, %User{}} = Auth.delete_user(user)
      assert_raise Ecto.NoResultsError, fn -> Auth.get_user!(user.id) end
    end

    test "change_user/1 returns a user changeset" do
      user = user_fixture()
      assert %Ecto.Changeset{} = Auth.change_user(user)
    end

    test "authenticate_user/2 with with correct email/password" do
      user = user_fixture()
      assert {:ok, authenticated_user} = Auth.authenticate_user("some email", "fake password")
      assert authenticated_user.id == user.id
    end

    test "authenticate_user/2 with real user and wrong password" do
      user_fixture()
      assert {:error, "Wrong email or password"} == Auth.authenticate_user("some email", "wrong password")
    end

    test "authenticate_user/2 with unrecognized user" do
      user_fixture()
      assert {:error, "Wrong email or password"} == Auth.authenticate_user("missing email", "fake password")
    end
  end
end
