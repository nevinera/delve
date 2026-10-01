# A character's class file no longer matches the checksum recorded when the
# class was fetched (see JoinZone#class_config); refetching the class fixes it.
class CharacterClasses::ChecksumMismatch < VerifiedContent::ChecksumMismatch; end
