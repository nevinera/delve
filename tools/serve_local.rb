#!/usr/bin/env ruby
# Serves a local directory over HTTP with permissive CORS headers.
#
# Usage: ./tools/serve_local.rb <directory> [--port PORT]
#   directory  path to serve (default: current directory)
#   --port     port to listen on (default: 9292)

require "sinatra/base"

port_idx = ARGV.index("--port")
port = port_idx ? ARGV.delete_at(port_idx + 1).to_i : 9292
ARGV.delete("--port")

dir = File.expand_path(ARGV[0] || ".")
abort "Directory not found: #{dir}" unless Dir.exist?(dir)

class LocalAssetServer < Sinatra::Base
  before do
    headers "Access-Control-Allow-Origin"  => "*",
            "Access-Control-Allow-Methods" => "GET, OPTIONS",
            "Access-Control-Allow-Headers" => "*",
            "Cache-Control"               => "no-store"
  end

  options "*" do
    200
  end

  get "/*" do
    path = File.join(settings.serve_dir, params["splat"].first)
    pass unless File.file?(path)
    send_file path
  end

  not_found { [404, {}, ["Not found"]] }
end

LocalAssetServer.set :serve_dir, dir
LocalAssetServer.set :port, port
LocalAssetServer.set :bind, "127.0.0.1"
LocalAssetServer.set :logging, true

puts "Serving #{dir} at http://127.0.0.1:#{port}/"
LocalAssetServer.run!
