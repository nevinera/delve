class Ability
  include CanCan::Ability

  def initialize(user)
    if user.admin?
      can :manage, :all
    else
      can :manage, CharacterClass, user: user
      can :manage, Zone, registering_user: user
      can :manage, Character, user: user
      can :read, CharacterItem, character: {user: user}
      can :manage, EquippedItem, character: {user: user}
      can :read, CharacterClass
      can :read, Zone
      can :read, User
    end
  end
end
