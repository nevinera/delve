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

