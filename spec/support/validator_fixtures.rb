module ValidatorFixtures
  DELVE_CONTENT = Rails.root.join("..", "delve-content")

  def zone_fixture
    @zone_fixture ||= JSON.parse(File.read(DELVE_CONTENT.join("zones", "goblin-cave.full.json")))
  end

  def goblin_unit_type
    zone_fixture["unitTypes"]["goblin"]
  end

  def goblin_boss_unit_type
    zone_fixture["unitTypes"]["goblin_boss"]
  end

  def cave_entrance_map
    zone_fixture["maps"][0]
  end
end

RSpec.configure do |config|
  config.include ValidatorFixtures, type: :validator
end
