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
    resources :zones, only: [:index]
    resources :worlds, only: [:index, :new, :create]
    resources :character_classes, only: [] do
      member { post :refetch }
    end
    # World records and their published versions (see plans/worlds.md),
    # keyed by database id - the bare `worlds` resource above is the
    # content editor, keyed by the world file's key.
    namespace :publishing do
      resources :worlds, only: [:index, :show, :create] do
        resources :versions, only: [:new, :create] do
          member do
            post :release
            post :reimport
          end
        end
      end
    end
    post "validators/ability", to: "validators#ability"
    post "validators/character_class", to: "validators#character_class"
    post "validators/unit_type", to: "validators#unit_type"
    post "validators/item", to: "validators#item"
    post "validators/map", to: "validators#map"
    post "validators/zone", to: "validators#zone"
    post "validators/world", to: "validators#world"
    post "validators/world_references", to: "validators#world_references"
    post "dps_sims/unit_type", to: "dps_sims#unit_type"
    post "class_dps_sims/character_class", to: "class_dps_sims#character_class"
    post "class_ttd_sims/character_class", to: "class_ttd_sims#character_class"
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
  post "build/classes/*id/publish", to: "build/classes#publish", as: "publish_build_class"
  get "build/classes/*id/versions", to: "build/class_versions#index", as: "build_class_versions"
  post "build/classes/*id/versions", to: "build/class_versions#create"
  get "build/zones/*id/play", to: "build/zone_plays#show", as: "build_zone_play"
  get "build/local_zones", to: "build/zone_plays#local", as: "build_local_zones"
  get "build/local_zones/*id/play", to: "build/zone_plays#show", as: "build_local_zone_play", defaults: {source: "local"}
  # The single-page world editor (see plans/world-editor/) - world keys
  # have no slashes, so a plain :id.
  get "build/worlds/:id/edit", to: "build/worlds#edit", as: "edit_build_world"
  post "build/worlds/:id/publish", to: "build/worlds#publish", as: "publish_build_world"
  get "build/worlds/:world/zones/:zone/play", to: "build/zone_plays#show", as: "build_world_zone_play"

  namespace :play do
    root to: "dashboard#index"
    resources :characters, only: [:index, :show, :new, :create, :edit, :update] do
      resources :worlds, only: [:index, :show], controller: "world_characters" do
        member do
          get :play
          patch :active
          patch :version
          delete :leave
        end
        resources :character_items, only: [:index, :show]
        get "flags/*flag", to: "character_flags#show", as: :flag, format: false
        resources :equipped_items, only: [:index, :update], param: :equipped_slot do
          post :best_available, on: :collection
        end
      end
      resource :setting, only: [:show, :update], controller: "character_settings"
    end
  end
  namespace :internal_api do
    resources :world_characters, only: [] do
      resources :character_items, only: [:create]
      resources :equipped_items, only: [:index]
      resources :zone_exits, only: [:create]
      resources :character_flags, only: [:create], path: "flags"
      get "flags/*flag", to: "character_flags#show", as: :character_flag, format: false
    end
  end

  root to: "home#index"
end
