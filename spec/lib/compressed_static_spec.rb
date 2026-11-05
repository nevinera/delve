require "rails_helper"
require_relative "../../lib/middleware/compressed_static"

RSpec.describe CompressedStatic do
  let(:dir) { Dir.mktmpdir }
  let(:app) { ->(_env) { [404, {}, ["not here"]] } }
  let(:static) { described_class.new(app, dir, headers: {"cache-control" => "public"}) }

  before do
    File.write(File.join(dir, "a.json"), "{}" * 1000)
    File.write(File.join(dir, "a.json.br"), "brotli")
    File.write(File.join(dir, "a.json.gz"), "gzip")
  end

  after { FileUtils.remove_entry(dir) }

  def read(body)
    out = +""
    body.each { |part| out << part }
    out
  end

  def get(path, encoding)
    static.call(Rack::MockRequest.env_for(path, "HTTP_ACCEPT_ENCODING" => encoding))
  end

  it "sends JSON's brotli copy to a browser that takes it, and gzip to one that takes only that" do
    status, headers, body = get("/a.json", "gzip, br")
    expect([status, headers["content-encoding"], read(body)]).to eq([200, "br", "brotli"])
    expect(get("/a.json", "gzip")[1]["content-encoding"]).to eq("gzip")
  end

  it "sends the file as it is to a browser that takes neither" do
    _, headers, = get("/a.json", "identity")
    expect(headers["content-encoding"]).to be_nil
  end
end
