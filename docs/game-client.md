# The Game Client

The client for this game will be in-browser. We'll build it using three.js,
and it's responsible for rendering the scene, smoothing motion, handling
visual assets, and translation keypresses into actions to send them to the
game server.

## Visually

The game is rendered with an intentionally low visual complexity - while we are
looking at a changing 3D scene, the camera shows a fixed angle behind and above
the character, and all of the actual visual assets (player token art, monster
token art, the map itself, and all the visual effects of various abilities) are
implemented as flat image files of various types.

Picture a flat (infinite) tabletop, which you are looking down at, at an angle.
Your character's token is in the lower-middle of the screen, so that you can see
much more ahead of you than behind. You're standing on an image, a graphical map
of the area, and where there are impassible features in the image (walls, trees,
cliffs), there are semi-transparent _ridges_ on the surface, indicating the
boundaries of the traverseable area.

Enemies and allies are also all tokens, moving around in your view. In the
lower-right, there's a minimap with a fixed orientation (though zones are able
to disallow that map), and if you press "M", you can (again optionally) see a
scale map of the entire zone, with your position/orientation displayed.

You're unable to see anything beyond vision-blocking barriers (walls, fog,
doors, etc) - while your camera could see down past the ridges, anything outside
of your character's field of view is dimmed and then black. When something
makes noise within your _auditory_ range, you can see little indicators of their
location even in the darkness, and that _may_ be your only hint before something
charges out of it at you.

You target it, then shoot a Fireball at it, which manifests as a transparent gif
(or another type of image with better transparency support) and a sound effect
(the good one, since you didn't miss). But the creature (seems to be some kind
of lion?) survives your attack, and runs in to Bite you (another, subtle visual
and auditory effect playing for those). At the same your ally across the room
starts shooting arrows - the sound effects somewhat muted because of the
distance.

## The UX

Aside from the scene itself, we have several UX elements:

* Unit Frames:
  - Character/Target: minimal; health and resource display, token, class/type.
    Right-click menu gets you options to see "Details"
  - Party: your party members look like you, arranged up the left side of the
    screen. Buffs/debuffs affecting them are displayed inside the frame.
  - Minimap: in the bottom-right, fixed-orientation, displays roughly as far
    as you can see, lights up areas that are visible, shows you as a little
    arrow (for orientation), displays party members and enemies that are
    visible.
  - Action Bar: Characters have a maximum of 12 abilities and three
    'consumables' (useable items that have cooldowns and/or limited uses per
    Instance). The Action Bar displays as two rows of 6, bound to 1-6 and
    shift+1-6. By default - later I'd like these to be rebindable, within
    limits. The consumables are bound to R, T, and Y. Along with showing your
    abilities, the Action Bar also shows cooldowns on them, including GCD
    (which is specified per-character, within limits, and some abilities don't
    trigger or obey).
  - Chat: The lobby's chat is still available in-game, and this is also where
    some information in-zone is communicated.
  - Loot/Pause/Etc - there is a small pulldown in the corner that allows various
    further bits of interface to be reached. "Loot received so far", "Pause and
    Unpause" button, "Kick Voting", "Exit Instance", "Unstick" (waits 10s, then
    teleports you to entrance), and some debugging tools that aren't very useful
    when actually playing, but are super valuable when testing out a Build.
