Rails.application.routes.draw do
  devise_for :users, controllers: {omniauth_callbacks: "users/omniauth_callbacks"},
    skip: [:sessions, :registrations, :passwords, :confirmations, :unlocks]

  as :user do
    get "/login", to: "devise/sessions#new", as: :new_user_session
    delete "/logout", to: "sessions#destroy", as: :destroy_user_session
  end

  get "up" => "rails/health#show", :as => :rails_health_check

  resources :users, only: [:index]

  namespace :build do
    resources :handles, only: [:index, :show, :new, :create]
    resources :zones, only: [:index, :show, :new, :create]
  end
  resources :character_classes, only: [:index, :show, :new, :create], path: "classes"
  resources :instances, only: [:show]

  root to: "users#index"
end
