Rails.application.routes.draw do
  devise_for :users, controllers: {omniauth_callbacks: "users/omniauth_callbacks"},
    skip: [:sessions, :registrations, :passwords, :confirmations, :unlocks]

  as :user do
    get "/login", to: "devise/sessions#new", as: :new_user_session
    delete "/logout", to: "sessions#destroy", as: :destroy_user_session
  end

  get "up" => "rails/health#show", :as => :rails_health_check

  get "home", to: "home#index"

  namespace :admin do
    resources :users, only: [:index]
  end

  namespace :github do
    get "connect", to: "connections#connect"
    get "reauth", to: "connections#reauth"
    get "callback", to: "connections#callback"
    get "token", to: "connections#token"
    get "manage", to: "connections#manage"
    delete "disconnect", to: "connections#disconnect"
  end

  namespace :build do
    root to: "dashboard#index"
    resources :abilities, only: [:index, :new, :create]
    resources :classes, only: [:index, :new, :create]
    resources :handles, only: [:index, :show, :new, :create]
    resources :zones, only: [:index, :show, :new, :create]
    post "validators/ability", to: "validators#ability"
    post "validators/character_class", to: "validators#character_class"
  end

  # A glob segment, not a plain :id + regex constraint (and defined outside
  # `namespace :build` so its `as:` isn't auto-prefixed with "build_" again,
  # which would otherwise double up into build_edit_build_ability_path): an
  # ability's key may itself contain "/"s (organizing it into a
  # subdirectory, e.g. "classes/druid/wildshape"). A :id + constraint
  # recognizes that fine on the way in, but Rails percent-encodes embedded
  # "/"s (as %2F) when *generating* a URL from a plain dynamic segment -
  # functionally still correct (the router decodes it back before
  # matching), but produces an ugly, unreadable link. A glob segment
  # carries literal "/"s through both directions natively, so
  # edit_build_ability_path(id: "a/b") comes out as a clean
  # "/build/abilities/a/b/edit" with no encoding involved.
  get "build/abilities/*id/edit", to: "build/abilities#edit", as: "edit_build_ability"
  get "build/classes/*id/edit", to: "build/classes#edit", as: "edit_build_class"

  namespace :play do
    root to: "dashboard#index"
    resources :characters, only: [:index, :show, :new, :create, :edit, :update] do
      resources :zones, only: [:index, :show]
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

  root to: "home#index"
end
