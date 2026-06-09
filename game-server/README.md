# game-server

Go HTTP server for the Delve MMO. Manages game instances (zones), handles WebSocket connections from clients, and runs per-instance game loops.

## Running

```sh
cd game-server
go run .
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT`   | `8080`  | Port to listen on |
| `DEBUG`  | `false` | Enable debug-level logging |

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/status.json` | Server health and instance count |

## Testing

```sh
cd game-server
go test ./...
```
