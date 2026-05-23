RSpec.configure do |config|
  config.include Devise::Test::IntegrationHelpers, type: :request

  config.after(type: :request) { Warden.test_reset! }
end
