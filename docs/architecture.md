# Architecture

There are three basic components to this system - the Application Server, the Game
Server, and the Game Client.

The Application Server is a web-application written in ruby/rails. It implements
the chat system, the character persistence, and hosts the Client. It also holds
the various (javascript) editing tools, for abilities, classes, monsters, and
zones, and the registration system with which one can expose their content for
others to use or play.

The Game Server is written in Go - it is responsible for running the Instances -
hosting and exposing their state, and receiving commands from the browser client
through websockets. It also implements the core of the game - the unit pathing,
combat AI, and enforcing the game rules. It communicates information directly to
the Application server as items are received, quests are progressed/completed,
and characters enter and leave zones.

The Game Client is written in Javascript, using three.js for its
scene-rendering. It shows the game context, including the area around the
character, other units nearby, unit-frames, and ability states. It is worth
noting that (unlike the servers) the Game Client does not attempt to be secure;
it has access to more information than it displays, and writing a "map hack"
(for example) would simply be a matter of forking the client and removing the
visibility-blocking layer - this is intended; taking complex entity-culling off
the server’s hands is a major improvement to server overhead. Unlike most 2D
role-playing games (or MMOs), Delve keeps a "first-person" feel, by holding the
character’s token in the center of the screen and using a fixed/relative camera
position, so that the world moves by as your character moves, rather than having
a static map with characters moving around on it.

## Authentication

The two servers authenticate with fixed tokens - they are not required to live
on the same host machine, but they do need to communicate. The client uses an
application-provided expiring token to access the instance server, and uses
standard cookie-based authentication to access the hosting rails application.

## Authorization

This topic is very complex for Delve. Players have access to their characters,
those characters’ quests/items/keys/history. Players can access various chats,
some public, some private. And players can manage their "registered assets" -
the units, abilities, classes, zones, and regions they have registered
themselves. But those assets do not live in Delve - even the core zones and
classes are defined in a public git repository and loaded directly from there by
the clients.

What players own when they register content, is the identifier. Builders don't
necessarily map to individuals, but each Player has an automatic Builder defined
for them (`user/<username>`). Players can manage their own Builder, but can also
create additional Builders, and share those identities, so that a user might
register the same content under their individual user ("builder-bob") and also
under a shared identity ("the-content-collective"). Doing so doesn’t give them
any particular control over that content, just over the way it’s described by
Delve.
