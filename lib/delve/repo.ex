defmodule Delve.Repo do
  use Ecto.Repo,
    otp_app: :delve,
    adapter: Ecto.Adapters.Postgres
end
