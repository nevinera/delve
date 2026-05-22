# Progression

One of the core areas of interest here is "progression" - it's a standard part
of any MMO and many other games; giving players something to work _toward_, a
way of incrementally improving their character (and their skills) until they're
able to defeat things they couldn't before.

And it's not that difficult! If we were just making a simple game, we'd publish
various dungeons, with increasing difficulty and also increasingly effective
gear, and the 'progression' would be about improving your gear and skill,
climbing the ladder of 'dungeon tiers' until you beat the last one.

And that'll be a thing that we _do_ build - the "core" progression will have
those things:

* a set of 1-player dungeons that are only a mild challenge with no equipment
  at all
* a few more that are probably too difficult to do without any gear, but
  _plausible_, and reward better stuff
* a set of initial dungeons that would be extremely tough to do naked, for
  groups of 2, 3, and 5 players
* 'heroic' dungeons that realistically need you to have most of your
  equipment from the prior tier
* 'legendary' dungeons for 5 or 10 characters that are a serious challenge
  even with the best heroic equipment on
* probably further dungeons and raids above those? We can keep going, obviously.

But the more interesting thing to discuss here is how we will enable builders
and communities to create their own Progressions, and build their own expansions
from the Core Progression.

## Equipment Provenance

Every piece of equipment you acquire from any dungeon, comes with a 'provenance',
a piece of information tracking where you got it from. Items are self-contained -
you don't hold a reference to the "Sword of Fire" (item id 31042), you have a
database record with the details of that item, including its implementation, and
that record has a provenance of "core_v2/t1/Firelands". You can then acquire that
same item from elsewhere - you might _also_ have a Sword of Fire from
`bobs_stuff_v7/legendary_mice`, and it might have the same implementation (or
not).

The point of it is that in _your_ dungeon, you can specify which provenances are
acceptable. A fairly standard option is to just list `core*` as acceptable, which
means that "all the gear you acquired from the standard core zones is allowed".
If you're just making a single dungeon, that's probably the right thing to do,
though if you're making a lower level one, you might want to only allow stuff
from the first tier of dungeons, or the single-player zones for example (so the
characters that can handle heroics don't treat your zone as a cakewalk).

More than that - you don't have allow individual zones, you can allow _tags_.
the `core*` is equivalent to allowing the `core` tag (because we will be putting
that tag on every such zone). But you _could_ create (and thereby own) the tag
`frozen_wastes/v1`, create a bunch of zones yourself, tag them all with
`frozen_wastes/v1`, and only allow equipment from _that tag_. And you've created
a parallel independent Progression! In fact, the 'core' Progression will be
built in _exactly that way_. Or if you get to the end of the core progression,
and you want there to be more, you can just add an 'expansion' on - make even
harder dungeons/raids, restrict content to your own tag plus the core, and
it's there.

## Discoverability

The reason people (mostly) want to build stuff is to share it - with somebody
specific, with a group, with the whole world. So we need a system that allows
Builders to share their content - declare it 'ready', expose it to an audience.
And we need further support to help that audience find great content (and to
discover it before it's popular, as a separate problem). There is some work
we can do for that, but the primary solution is social - we need to make it
convenient and appropriate to recruit people to try out more progressions.

More important is the shared culture, and I don't have a good handle on how
to influence that yet. Though I do have hopes that the open-source and
user-contributed nature of the system will help with that - OSS tends toward
a contributocracy, which is necessarily socially accomodating.
