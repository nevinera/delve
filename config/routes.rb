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
    resources :unit_types, only: [:index, :new, :create]
    resources :items, only: [:index, :new, :create]
    resources :maps, only: [:index, :new, :create]
    # The content-editing zone editor (see plans/zone-editor.md) owns the
    # bare `zones` resource name, matching every other content editor above
    # (classes/unit_types/items/maps). The DB-backed Zone *registration* UI
    # (register a deployed zone config by identifier/version/config_url -
    # unrelated to content editing) lives under this `registration`
    # namespace instead, out of that name's way.
    resources :zones, only: [:index, :new, :create]
    namespace :registration do
      resources :zones, only: [:index, :show, :new, :create]
    end
    post "validators/ability", to: "validators#ability"
    post "validators/character_class", to: "validators#character_class"
    post "validators/unit_type", to: "validators#unit_type"
    post "validators/item", to: "validators#item"
    post "validators/map", to: "validators#map"
    post "validators/zone", to: "validators#zone"
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
  get "build/unit_types/*id/edit", to: "build/unit_types#edit", as: "edit_build_unit_type"
  get "build/items/*id/edit", to: "build/items#edit", as: "edit_build_item"
  get "build/maps/*id/edit", to: "build/maps#edit", as: "edit_build_map"
  get "build/zones/*id/edit", to: "build/zones#edit", as: "edit_build_zone"

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
