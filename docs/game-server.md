# The Game Server

The game server is responsible for _running each instance of the dungeon_. It
needs to manage instance-launching, recoverability, and websocket
communications, as well as the actual _behavioral logic_ of the game itself.

The initial goal is to comfortably run a thousand active instances with five
players each on an EC2 medium. To reach that goal, the game server will be
implemented in Go, and everything reasonable is being offloaded to the clients -
visiblity, bound-checking, range-checking, etc. The server will still check
those things, but will not be _responsible_ for them - the client determines
the player can't pass through a wall and doesn't ask, but if it sends a movement
that _has_ the player passing through a wall, the server will reject it
(probably forcing a lag-back and catchup on the player's part).

## Auth

The application server will supply players with an 'instance token' when they
start or join an instance; all requests to the game server need to include that
token in an auth header, or they will be rejected. That token specifies the
player and character identity, and suffices to confirm that the instructions
sent by the player belong to them.

There is room (though we will not implement it initially) for a "spectator"
mode - one where the character has free movement and visibility, but cannot
send changes to the server, and is not displayed to the active players. Such
a role would still require a token (to establish the websocket), and will
also need an upper-limit per instance (max-spectators).


## Instance State

"Instance" here means _the player perception_ of an instance - a particular
dungeon attempt, with continuity of context. We'll use _instantiation_ to
refer to the game-server's conception of an 'instance', which is a set of
goroutines tracking and updating the Instance state for the players.

The Instantiation of the instance is distinct from the Instance itself, because
an Instance can be paused and resumed, can be left and returned to, and can
crash and be recovered. In all of those cases, the Instantiation is being ended
and recreated, while the Instance is retained.

To support that behavior, we have two levels of persistence mechanism. Every
'tick' (and we're ticking a 10hz, initially), the in-memory state of the
Instantiation is updated (and versioned into 'deltas'). Every 50 ticks (5s),
that state gets updated into the game-server's database as the "persisted state"
of the Instance - if the instantiation crashes, it can be recovered from that
record; if a player disconnects, the catch-up process looks like "fetch the
persisted state, and replay the deltas since then".

The persisted state of an Instance will be retained for a substantial length of
time - I'm currently assuming "10 days after the last time it was instantiated,
to a maximum of 30 days", which allows for long-term excursions into difficult
dungeons, and also supports players that can't play _that_ often.

The players in an instance can _also_ "pause" the instance - depending on the
configuration supplied by the Party Leader, either any of them, or just the
leader, and they might have a limited number and/or duration of pauses each.
When an instance is paused, it's still running, but after 60s of being paused
it will terminate (somewhat invisibly - starting it back up from the persisted
record should be pretty fast).

## Allowed Equipment

The game server does enforce the provenance restrictions on equipment - it
rejects join/create attempts that fail that check. Actually explaining the
issue(s) and helping the player swap out gear is a problem for the application
server though.

## Asset Versioning

The game-server tracks a sha indicating the _version_ of the zone that has been
instanced - even if the upstream definition of the dungeon changes, the Instance
will continue to use the specified sha as its source. If the upstream definition
_lacks that sha_ (force-pushed, repo deleted, etc), the Instantiation will just
fail to start. There is unfortunately also a possibility that this happens after
the Instantiation is running but before some of the _clients_ have fetched the
relevant assets, and that will need to be presented to the Client directly.

The game-server also_tracks the Class of each joined character in the same way - 
if the Class gets updated, the character will continue using the version they
entered with. Note that it's possible for two characters with the same class to
end up using different _versions_ of that class, if it's being actively
developed at go-time - this is acceptable, but probably worth making
discoverable in the UI (showing a class-version on hover, or something).

The _clients_ are responsible for fetching all of the relevant graphical assets
from their sources - initially this will all be done via http/git, but later
we may introduce a CDN, as I suspect that fetching dozens to hundreds of assets
from git repositories will take non-trivial amounts of loading time. Hopefully,
we can use browser-caching to mitigate that as well.
