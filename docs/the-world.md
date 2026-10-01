# The World(s)

In a typical MMO, the world is organized into "zones" (and above that into
"continents" or "planes", etc). In Delve, we need to go smaller. What you might
think of as a "zone" in a game like WoW or FFXIV is massive by our standards -
we refer to things on that scale as "regions". A region might be dedicated
to a small group of factions clashing, or to a particular wilderness, and it
might have multiple "dungeons" in it. But in Delve, that region is a
constellation of zones, connected together by zone-transitions.

Those zones can be quite large, dimensionally speaking - the primary constraint
on the size of a zone is the number of units in it that might have simultaneous
behavior (the server spends the bulk of its resources on unit pathing and
decision-making). And a zone can contain multiple "maps" - a fortress zone might
have first-floor and second-floor map, with stairways between them. A
mountainous zone might have a 'main' map with the surface of the world, and a
'tunnels' map that holds the caves beneath it, which you can simply walk into.
But the server will track the state of everything in the zone (everything that
isn't in its default state) and communicate that state to all of the clients
roughly every 100ms via deltas with checksums.

Each zone can hold only 25 characters before being "full" - we handle that using
'instances', just like dungeons. "Public" zones are pooled, so that when a
character or party enters that zone, they get added to whichever instance has
room (and if there aren't any, a new one gets added). "Private" zones are held
by the character that created them (the "party leader" in such a zone) - each
character can only have one such, and they'll be shut down when empty.

The Region can only be entered at certain places - "entry points". Entry points
may be "open", in which case you can just pick that zone from the selection page
and spawn in. But a lot of the entry-points are only reachable by visiting their
connected location in another zone, and travelling through the visual 'barrier'.
Scattered around the region will be additional entry points, which can't be used
without the appropriate "key" (often granted just by reaching them, but
sometimes there may be a quest chain).

### Example

If the "Northern Barrens" were a delve region, things like Crossroads or Ratchet
would be zones. You'd have a zone for that mountain surrounded by quillboars, a
zone for the samophlange tower, a zone for the Stagnant Oasis, the Forgotten
Pools, the Lushwater Oasis (and another zone for the Wailing Caverns. Or
possibly three - that place is huge). A zone for the Sludge Fen, for Dreadmist Peak,
or the Mor'shan Rampart. Having points to connect zones together (rather than
borders) does mean that they need to be a bit more constrained/surrounded/
enclosed, and we don't need to represent all of the space between the zones - a
transition might take you through a door into another part of the castle, but it
might also take you across the pass to the other side of the mountains (which leaves
lots of room to add zones in the middle of regions, which is often a problem in
a more traditional 3d-physicality-bound representation).

A zone can have multiple distinct visual identities within (especially if it has
multiple maps) - it's best to decide based on how continuous the place is. It
might make sense to have a quite large plains map with a few centaur tribes
scattered around, but connect it to zones for the bordering forest, a desert, a
coast-line, etc, all places that could just be scattered onto the one map, but
can be given much more detail as their own locations.


## Publishing a World

A World lives entirely in one public GitHub repo: its world file plus every zone it references.
Delve stores only references to that content (the repo, file paths, commit SHAs, and checksums),
never the content itself.

A **World version** is the world as of one commit.
- **Publish** in the world editor tags the default branch's latest commit (`<world-key>/v<N>` by
  default) and imports that commit as a new version. A tag you made yourself can be imported
  from the world's Versions page instead.
- The **import** fetches the world file and each zone's `.full.json` at that commit, validates
  them, and checks that every world link and entry point names a real connection. A failed import
  shows its error on the Versions page, and can be retried with Reimport.
- A successful import leaves the version **unreleased**: nobody plays it until it's released.
- **Release** makes a version the one players get. Earlier released versions expire 24 hours
  later.

The tag is only for human reference. A version always reads its files by commit SHA, so moving
or deleting the tag afterwards changes nothing.

## Playing a World

Each character has a list of worlds (Play → a character → Worlds): every world with a released
version, minus any they've hidden. "Show all" brings hidden worlds back.

The first time a character enters a world, Delve creates a record of their time there: which
version they're on and the connection point they last used. They start at the world's first entry
point that needs no key.
- **Re-entering** puts them back at their last connection point. If that zone or connection no
  longer exists in the version they're entering, they start at the entry point instead.
- **Travelling:** stepping onto one of a zone's world-linked exits takes the character to the
  connection on the other side, a new page load into that zone's instance. Exits only fire when
  stepped onto (not when spawning on or standing on one), and not within 6 seconds of arriving.
- **Versions:** a character stays on their version until it expires. Outside the world, they can
  switch to any released version that hasn't expired. When a version expires while they're in
  it, they get a countdown for the last 10 minutes, then they're moved to the latest version.

Delve only stores where a character is between zones. Inside a zone, the instance tracks their
position; if they leave the instance some other way, they return at their last connection point.

Items are still tracked per character, not per world. That changes in a later update.
