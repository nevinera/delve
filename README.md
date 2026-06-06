# Delve

A user-generated MMO built for low server overhead and low content-creation barriers. Zones, units, and powers are defined as JSON files hosted in public repositories - the game server loads them directly. The application server handles character persistence, registration, and hosting the browser client.

See [docs/goals.md](docs/goals.md) for the full design philosophy.

## Documentation

### Design

| Doc | Description |
|---|---|
| [docs/goals.md](docs/goals.md) | Project goals and design philosophy |
| [docs/architecture.md](docs/architecture.md) | System architecture: application server, game server, client |
| [docs/the-world.md](docs/the-world.md) | How zones, regions, and instances fit together |
| [docs/classes-and-abilities.md](docs/classes-and-abilities.md) | Classes and powers: design philosophy and user contributions |
| [docs/stats-and-equipment.md](docs/stats-and-equipment.md) | Stat system and item scoring |

### Content Formats

Content is defined in JSON files conforming to the schemas in [docs/schema/](docs/schema/). See [docs/formats.md](docs/formats.md) for an index of all schemas and the coordinate system used across them.

## Development

### Requirements

- Ruby 3.3.9
- SQLite

### Setup

```sh
rvm use 3.3.9@delve
bundle install
bin/rails db:setup
```

### Running

```sh
bin/rails server
```

### Tests

```sh
bundle exec rspec
```
