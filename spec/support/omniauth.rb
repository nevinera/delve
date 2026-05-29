OmniAuth.config.test_mode = true

def set_google_auth(uid: "12345", email: "test@example.com", name: "Test User")
  OmniAuth.config.mock_auth[:google_oauth2] = OmniAuth::AuthHash.new(
    provider: "google_oauth2",
    uid: uid,
    info: {email: email, name: name}
  )
  Rails.application.env_config["devise.mapping"] = Devise.mappings[:user]
end

def google_auth_hash(uid: "12345", email: "test@example.com", name: "Test User")
  OmniAuth::AuthHash.new(
    provider: "google_oauth2",
    uid: uid,
    info: {email: email, name: name}
  )
end

RSpec.configure do |config|
  config.after do
    OmniAuth.config.mock_auth[:google_oauth2] = nil
    Rails.application.env_config.delete("devise.mapping")
  end
end
