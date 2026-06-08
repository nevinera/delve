class Ability
  include CanCan::Ability

  def initialize(user)
    if user.admin?
      can :manage, :all
    else
      can :manage, Handle, user: user
      can :manage, CharacterClass, user: user
      can :manage, Zone, handle: {user: user}
      can :read, Handle
      can :read, CharacterClass
      can :read, Zone
      can :read, User
    end
  end
end
