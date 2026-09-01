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
    root to: "dashboard#index"
    resources :handles, only: [:index, :show, :new, :create]
    resources :zones, only: [:index, :show, :new, :create]
    resources :character_classes, only: [:index, :show, :new, :create]
  end

  namespace :play do
    resources :characters, only: [:index, :show, :new, :create, :edit, :update] do
      resources :zones, only: [:show]
      resources :character_items, only: [:index, :show]
      resources :equipped_items, only: [:index, :update], param: :equipped_slot
    end
  end
  namespace :internal_api do
    resources :characters, only: [] do
      resources :character_items, only: [:create]
      resources :equipped_items, only: [:index]
    end
  end

  root to: "users#index"
end
