require "rails_helper"

RSpec.describe Validators::PlacesValidator, type: :validator do
  let(:square) { [[0, 0], [10, 0], [10, 10], [0, 10]].map { |x, y| {"x" => x, "y" => y} } }
  let(:camp) do
    {
      "identifier" => "arrens_camp", "name" => "Arren's Camp", "description" => "A hunters' camp by the stream.",
      "tags" => ["camp", "friendly"], "polygon" => square,
      "annotations" => {"population" => "Arren and two guards; quiet.", "mood" => "safe"}
    }
  end

  def expect_invalid(places, message, path)
    expect { described_class.validate!(places, path: "$.places") }
      .to raise_error(Validators::ValidationError, message) { |e| expect(e.path).to eq(path) }
  end

  it "accepts places, overlapping or not, with only an identifier and a polygon required" do
    expect { described_class.validate!([camp, {"identifier" => "area_2", "polygon" => square}]) }.not_to raise_error
  end

  it "raises on a polygon of fewer than three points" do
    expect_invalid([camp.merge("polygon" => square.first(2))], /at least 3/, "$.places[0].polygon")
  end

  it "raises on an identifier that isn't a slug" do
    expect_invalid([camp.merge("identifier" => "Arren's Camp")], /lowercase letters/, "$.places[0].identifier")
  end

  it "raises on two places with one identifier" do
    expect_invalid([camp, camp], /more than one place named "arrens_camp"/, "$.places")
  end

  it "raises on an annotation that isn't text, or a key that isn't a simple word" do
    expect_invalid([camp.merge("annotations" => {"population" => {"count" => 3}})], /must be a string/, "$.places[0].annotations.population")
    expect_invalid([camp.merge("annotations" => {"Who lives here?" => "Arren"})], /keys must be lowercase words/, "$.places[0].annotations.Who lives here?")
  end

  it "is checked as part of a map" do
    map = zone_fixture["maps"][0].merge("places" => [camp.merge("polygon" => [])])
    expect { Validators::MapValidator.validate!(map) }.to raise_error(Validators::ValidationError, /at least 3/)
  end
end
