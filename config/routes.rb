Rails.application.routes.draw do
  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", :as => :rails_health_check

  # Render dynamic PWA files from app/views/pwa/* (remember to link manifest in application.html.erb)
  # get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  # get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker

  devise_for :users, controllers: {omniauth_callbacks: "users/omniauth_callbacks"},
    skip: [:sessions, :registrations, :passwords, :confirmations, :unlocks]

  as :user do
    get "/login", to: "devise/sessions#new", as: :new_user_session
    delete "/logout", to: "sessions#destroy", as: :destroy_user_session
  end

  namespace :github do
    get "connect", to: "connections#show"
    get "reauth", to: "connections#reauth"
    get "callback", to: "connections#callback"
    get "token", to: "connections#token"
    delete "disconnect", to: "connections#disconnect"
  end

  if Rails.env.local?
    post "/dev_session", to: "dev_sessions#create", as: :dev_session
  end

  root "home#show"
  get "home" => "dashboard#show", :as => :home
  get "create" => "create#show"
  resources :worlds, only: [:index, :create, :show] do
    resources :imports, only: [:create], controller: "world_imports"
    resource :release, only: [:create], controller: "world_releases"
    resource :reset, only: [:create], controller: "world_resets"
  end
  get "play/:id" => "play#show", :as => :play
  get "objects" => "objects#show"
  get "classes" => "classes#show"
  get "character_builder", to: redirect("/characters/new")
  resources :characters, except: [:show]
  get "animation_lab" => "animation_lab#show"
  get "monster_lab" => "monster_lab#show"
  get "creatures" => "creatures#show"
  get "creature" => "creatures#creature"
  resources :client_errors, only: [:index, :create]

  # For the game server (.agents/formats.md).
  namespace :internal_api, path: "internal" do
    resources :worlds, only: [] do
      resources :characters, only: [:show] do
        put :position, on: :member
        put :class, on: :member, action: :pick_class
        put :build, on: :member
        put :level, on: :member
        put :bars, on: :member
      end
    end
  end
end
