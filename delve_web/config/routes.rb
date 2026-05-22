Rails.application.routes.draw do
  devise_for :users, controllers: { omniauth_callbacks: "users/omniauth_callbacks" },
             skip: [:sessions, :registrations, :passwords, :confirmations, :unlocks]

  as :user do
    get "/login", to: "devise/sessions#new", as: :new_user_session
  end

  get "up" => "rails/health#show", as: :rails_health_check

  root to: redirect("/login")
end
