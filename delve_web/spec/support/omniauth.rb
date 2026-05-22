def google_auth_hash(uid: "12345", email: "test@example.com", name: "Test User")
  OmniAuth::AuthHash.new(
    provider: "google_oauth2",
    uid: uid,
    info: { email: email, name: name }
  )
end
