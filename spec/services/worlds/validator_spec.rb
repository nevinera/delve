require "rails_helper"

RSpec.describe Worlds::Validator do
  def world_dir(files)
    dir = Dir.mktmpdir
    files.each do |path, text|
      FileUtils.mkdir_p(File.dirname(File.join(dir, path)))
      File.write(File.join(dir, path), text)
    end
    dir
  end

  it "lists each file's blob sha and size" do
    world = {version: 1, name: "Small", continents: [{key: "main", name: "Main"}], dungeons: []}.to_json
    result = described_class.call(world_dir("world.json" => world))
    expect(result["problems"].map { |p| p["message"] }).to eq(["has no spawn point: place one on the editor's civilization step"])
    expect(result["files"]).to eq("world.json" => {"sha" => Digest::SHA1.hexdigest("blob #{world.bytesize}\0#{world}"), "size" => world.bytesize})
  end

  it "gives the problems it finds" do
    result = described_class.call(world_dir("world.json" => "{}"))
    expect(result["problems"].map { |p| p["message"] }).to include("needs a name")
  end

  it "fails when it can't read the world" do
    expect { described_class.call("/nowhere/at/all") }.to raise_error(described_class::Failed, /usage/)
  end
end
