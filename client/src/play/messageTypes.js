// Written by `go generate ./internal/game` in game-server, from docs/schema/messages.schema.json. Don't edit it: change the schema.

// The messages the game server sends, by type.
export const SERVER_MESSAGES = Object.freeze(["pickClass", "welcome", "snapshot", "appear", "vanish", "died", "moved", "statusOn", "forced", "correct", "used", "swung", "attacking", "stopped", "refused", "sees", "cooldown", "lockout", "hit", "health", "restPoints", "home", "loggingOff", "logOffStopped", "loggedOff", "level", "bars", "build", "effectArea", "effectAreaGone", "absorb", "look", "gear", "targetable", "controls", "speed", "statusChanged", "statusGone", "resources", "log", "teleport", "error"]);

// The messages a client sends, by type.
export const CLIENT_MESSAGES = Object.freeze(["pick", "move", "heartbeat", "use", "bars", "build", "stop", "logOff", "makeHome", "attack", "sees", "command"]);
