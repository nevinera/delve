# Delve

A browser-based 3D MMO in a tiled, height-mapped world.

- `app/`, `config/` and friends: the Rails app (accounts, characters, chat, publishing; hosts the
  client).
- `client/`: the three.js game client, built with vite into `public/client`.
- `game-server/`: the Go game server.

[.agents/architecture.md](.agents/architecture.md) covers how the pieces fit together, and [.agents/formats.md](.agents/formats.md) covers the world file formats. They're written for agents, and work for people too.

## Development

### Requirements

- Ruby 3.3.9 (`rvm use 3.3.9@delve3d`)
- Node 22
- Go 1.26, and golangci-lint
- SQLite

### Setup

```sh
bundle install
npm install
bin/rails db:prepare
```

### Running

```sh
bin/dev
```

This runs Rails on port 8000, the game server on 8090, and the client build in watch mode.

### Tests and lint

```sh
bundle exec rspec
bundle exec standardrb
npx vitest run
(cd game-server && go test ./... && golangci-lint run ./...)
```

## License

The code is [MIT](LICENSE). Stock icons are CC BY 3.0, and [ATTRIBUTIONS.md](ATTRIBUTIONS.md) lists everything that isn't ours.
