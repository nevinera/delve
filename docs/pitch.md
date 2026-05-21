# The Pitch

"Delve" is an open-source platform for user-generated progressions of team-based
dungeoneering.

It attempts to combine the experience of early-days MMO dungeon delving (finding
good teammates, conquering and learning dungeons, improving equipment to tackle
harder dungeons) with a dramatic simplification of the interface to make custom
dungeons as buildable as minecraft worlds.

To achieve this, we reduce the graphics down to tokens on a (roughly) two-dimensional
field, so that all of the visuals are built and managed via image files, either on
tokens or on the map itself. And we construct the character classes from a "tool
kit", defining individual abilities in terms of configuration instead of code, both
for player classes and for enemy units.

As a result, constructing a dungeon is a matter of defining boundaries, supplying
image assets (like a map), placing monsters, and setting triggers and traps. Doing
this in a _massive json file_ is of course not the most convenient, but it _is_
very amenable to LLM composition. But humans will interact with a map editor,
allowing the _drawing_ of boundaries, drag-and-drop monsters, etc.
