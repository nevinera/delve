# Stats and Equipment

* Power
  * Focus: increase the amount of damage your attacks do
  * Piercing: reduce the mitigation of your attacks/crits
* Accuracy
  * Hit chance: reduce the odds that you miss
  * Crit chance: increase the odds that you critically strike
* Fortitude
  * Toughness: Hit points, reduced damage from crits
  * Resistance: preventing/mitigating non-attack-like abilities - poisons,
    curses, etc
* Recovery
  * Regen: Health recovery and debuff duration reduction (note that heals all
    use the target's regen as a factor)
  * Spirit: mana regen (or other resources - different classes can use this
    differently)
* Speed
  * Haste: Attack speed and ability effect rate (damage over times, etc)
  * Avoidance: dodging attacks and attack-like abilities, causing them to miss
* Defense
  * Armor: Physical damage mitigation
  * Caution: Reduced damage from crits and AoEs

Items are primarily granters of these stats, and the stats are arranged so that
very high offensive stats will be offset by very defensive stats on an opponent.
This is mostly how dungeon tiers are gated - the creatures within will have
higher stats, and will therefore do too much and take too little damage against
an undergeared group.

Items have a 'score', which is the budget from which stats are purchased. The
price of stats on an item is on a curve - an item with 20 focus on it would be
higher item score than an item with 10 power (which is 10 focus + 10 piercing), or
an item with 10 toughness and 10 armor, and both of those would be higher than
an item with 3 power, 3 speed, and 8 haste.

That score is calculated by the game for pure-stat items, but the item-score
cost of certain other things must be specified by the Builder. Items can also
have 'proc' effects - "chance to gain 20 focus when struck" and the like. These
are generally limited to a few types of equipment, and are tough to properly
score. And the 'consumable' items (reusable with a cooldown, and limited uses
per private instance) have the same issue.

It's worth noting that all characters will need to accumulate some amount of
most stats to handle more difficult content. A character with very little
Toughness will be getting killed in one hit by many abilities, and a character
with no Armor will need a lot of healing in cleave situations.
