# The Application Server

The application server is responsible for all long-term persistence, for
managing character equipment and characters, registration of zones, classes,
units, and abilities. It's a Rails application, backed by a database, and
handling authentication and authorization in standard ways.

It also hosts the Lobbies and Chat system, and profiles for players and builders.

## Auth

Authentication is handled via devise - initially login requires a username and
password, though we'll work on google and github oauth options in the future.

Authorization is an interesting topic; we'll likely be using CanCan (the de facto
standard), but might pivot from that depending on performance needs. Users have
'ownership' of tags they've defined and content they registered (do note that
content _can_ be registered again by a non-author for their own use, and that
shouldn't cause any problems for the system). They also own any Characters that
they have created.

Registering content with the system does _not_ imply that you have any rights to
that content - the content in question will not be transferred to the server,
nor will it duplicated and republished - it will be used directly from its
registered source each time it is used.

### Chat

Chat is a well-explored topic. The built-in chat is intended to be functional,
supporting broad "channels", and more focused "lobbies" that are associated with
an instance. Chat content will not be persisted long-term - it's intended to be a
tool for finding other players and setting up games. Channels will be public, and
won't be lockable.

Once Guilds are implemented (likely as an applyable Character tag), they will
also have an associated channel, with restricted access, and will be useable
as a filter for Lobby access.


### Lobbies
Lobbies are functionally just a type of Chat, but will be more controlled, since
they are how one sets up a group to play with - they _can_ be publicly joinable,
but whoever creates the lobby will be in control of it, and can specify a
password requirement, only allow people by invitation, etc.

Lobbies will, however, be short-lived. They cannot exist for more than a day
without an instance being started, and they will last for as long as the instance
exists (is resumable) plus one day.

### Character Armory
What characters do you have, and what equipment do they each have access to?
Along with being able to _see_ the equipment, you can set up "outfits"
(including gear you don't actually possess to see the resulting stats), and
it will include significant filtering capabilities. In particular, you'll be
able to filter the available items down to "usable in dungeon X", so you can
set up your gear ahead of time for the Zone you intend to tackle. When you
enter the Lobby for a Zone, you'll automatically where the first outfit tagged
for that zone, otherwise you'll need to pick from the allowable equipment just
then, which can take a moment.

### Content Manager
Not everyone is into building Zones, Units, Abilities, Items, Zones.. but I hope
that _many_ will be. The Content Manager let's you register your content with
the system, and is also where you can apply any tags you have access to (including
'public' tags) to that content. Or to _any_ content - you can apply _your_ tags
to content you didn't register, for several distinct reasons. Be aware that they
won't be _displayed_ on that content in any particularly visible way - your tags
are for you to use and control.

Note that content does not _live_ in this system - it's hosted separately, in
the git repositories of its maintainer (including the core content - that will
be in this repository, but will be referenced _via git_, not served by the
application server.

### Content Browser
Yes, people can make their own content, and tell their friends.. but once
there's a substantial amount of it, that will not be effective. The Content
Browser is a way to see content that has been given the `public/available` tag,
and will expose (and be sortable by) how much that content is _used_ (in actual
instances). This is how you can find Zones or Progression Sets that the
community has enjoyed substantially, and give them a shot. It's _also_ how a
Builder can find interesting Units, Items, and Abilities to use in their _own_
content.

### Leaderboards
Will not be a thing. There is no anti-cheating functionality built into the
game, and Leaderboards are the simplest way to get people to build hacks and
use them.

### Editors
The Item editing tool is uncomplicated - essentially a web-forms with a search
system to find and add abilities, and an 'item-score' estimation calculator.

The "Ability" editing tool is a bit more interesting - alongside
some of the same, we also have a small canvas that shows what it looks like
when triggered, so you can iterate on the graphic conveniently.

And the Unit editing tool is even moreso; we'll actually render the unit with
a target dummy and have it use each of its abilities in turn.

The Zone editor though, will be very complex - you'll pick a 'map' image file
(which can be one of the various blank defaults), and then start drawing the
"boundaries" onto it of various types - walls, doors, windows, one-way walls
(which is mostly useful for 'cliffs'). Then fill in types of terrain (difficult
terrain slows movement across it for most, hazardous terrain hurts to walk
through, deadly terrain just kills you, etc). You can place units from a tray
on the side (with search so you can find the ones you want from the huge set of
registered units, though the Core units will be enough for many people).

Lootables, start-location, traps (step across this line and trigger an ability
on a fixed area, have units A-C start patrolling to the area), triggers (use
this lever to remove that section of wall, kill this unit to make that door
openable), and spawns (add a new orc every 5 minutes as long as there are less
than 12 on the map).

There's a lot of possibilities, and the intent is always to develop those
options as json-capabilities _first_, and update the zone-editor to accomodate
them afterward. But the long-term goal is that a 12-year-old that can play
minecraft should be able to make a dungeon (though making one that _can be
beaten_ is a separate skill they'll have to develop).
