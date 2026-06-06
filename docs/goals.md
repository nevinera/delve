# Goals

Our intent is to enable a user-generated MMO (or debatably, collection of
similar MMOs). In order to support a working MMO without funding (or a profit
motive), we have three major focuses:

1. Very low server overhead - the game should run just fine on a laptop, and an
   EC2 Medium should suffice to handle thousands of instances with ten times
   that many players active concurrently.
2. Very low barrier to entry for generating content - limiting the aesthetic to
   2D images, and the full representation of contributed content to assets and
   JSON files enables the creation of significant content without professional
   design or tooling, and especially without writing code.
3. Content should be easy to extend and expand, but should be safe from other
   content - the provenance system is the solution to power creep and 'homebrew
   balance' concerns.

The approach is partly based on MUD architectures, and enabled by recent LLM
advances - a year ago, generating 2D image content of the sorts needed would
still have been a difficult project for most. The initially "included" region
will be limited, growing to a few dozen zones, 5-6 dungeons for differently sized
groups, and four character classes (two hybrid tanks, two hybrid healers). But
my hope is that, once we've written enough content to show that the game can
easily express stories and world-building, content will be produced rapidly, in
the same way that Minecraft worlds and packs are created - by people wanting to
build and share something with other people.

## As An MMO

Departures from the typical shape of an MMO are obvious - the 2D aesthetic is
very limiting, but required to enable anyone without significant graphical
modeling skills to produce distinctive content. The instanced questing zones
allow for efficient and cheap hosting. The browser-based client enables multi-
platform support without a fleet of paid developers.

There are no levels or reputations, no grinding, no economy, no true
consumables. These are all incompatible with provenance-based content
boundaries, and largely a result of the corporate profit motive to begin with.

## As A Community

I am inspired by the open-source communities I have been a part of, and the
communal appreciation they bear, as well as by the web-fiction communities and
their flowing love for their authors. It is my hope that, once a few focused
Builders have created their own interesting content, a community of contributors
and explorers will emerge, and that Builders will have an appreciative audience and
be encouraged and celebrated. It is critical for that purpose that we limit the
competitiveness that often emerges in these contexts - no leaderboards, no
factions, no elitism.
