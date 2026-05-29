# Classes and Abilities

In the vast majority of games, the classes (and the abilities they use) are
codified into the game. Delve will not do so - instead, we’ll have a toolbox
with which to make abilities (and the abilities make the class). This is going
to be initially limiting - you could make a spell that heals somebody and
applies a buff that heals them over time, or a spell that does damage and
applies a debuff that increases the frost-damage taken, but you couldn’t really
make a chain-heal or lava totem.

Abilities and Classes therefore, are configuration - a big json blob defining
the class and describing the abilities (and passives) that it has. They have a
maximum of twelve active abilities and 6 passive ones, but those can be fairly
complex - you can make an ability for example that shoots a light beam when
you're in 'human' state and attempts to bite someone when in 'wolf' state.

The design philosophy I'm bringing for the core classes is that all classes
should be either tanks or healers, and capable of dealing similar levels of
damage when geared toward that. The initial game will ship with four: Druid and
Cleric as healer-hybrids, Shifter and Paladin as tank-hybrids.

## User-Contributable

As with Zones and Units, Classes and Abilities will be user-contributable (and
in much the same ways). To play a class, it needs to be registered with the
application server; it will only be playable in Zones the explicitly allow it
(or a tag it has). This means that, if you create a new class, you won't be able
to play it in most places - the Core Zones however will be registered twice, as
'core' and as 'core/open' - the latter will explicitly permit all classes, so
they can be tried out (but don’t expect anyone around you to be balanced or
functional unless you’re coordinating with them!)

## Visual and Audio Effects

The core classes (and monsters) will include some standard effects (light beam,
fire beam, splash, punch, etc) and a number of simple sound effects to use.
These will end up duplicated into every repository that implements a class (or
monster), but they’re also just fixed size images with transparency, and fixed-
duration audio clips of particular formats, easy to generate with various
editors or LLMs.
