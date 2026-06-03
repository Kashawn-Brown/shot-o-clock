> **Deprecated:** The planning blueprint served its purpose and is no longer maintained as of 2026-06-03. Product context now lives in `plan.md` / `timeline.md`; specs in `docs/specs/` remain authoritative.

> Sliced from the master Shot O'Clock planning blueprint.
> Cross-reference: **The locked schema is in `docs/specs/schema.md`.** This step is the conceptual data model that led to that schema. When in doubt, the schema spec wins.
> When this doc and a spec in `docs/specs/` disagree, the spec wins (the spec is the locked implementation contract; this doc is the planning rationale that led there).

---

# Step 3: Data Models

## Core Modeling Rules

Shot O'Clock should be modeled around these ideas:

1. User/Guest is identity.
2. PartySession is the game room.
3. PartyPlayer is someone inside a specific party.
4. Round is one Shot O'Clock cycle.
5. RoundPlayerOutcome records what happened to each player.
6. AdminActionLog records host/admin changes.
7. Media/album models are future-facing but important.

Do not create one giant user/player/session object.

## 1. User

Represents a registered account.

```text
User
- id
- email
- username
- displayName
- profileImageUrl
- accountStatus: active / suspended / deleted
- legalAgeConfirmedAt
- legalAgeRegion
- termsAcceptedAt
- termsVersionAccepted
- privacyPolicyAcceptedAt
- createdAt
- updatedAt
- lastLoginAt
```

For now, avoid storing full birthday unless truly needed. Store legal-age confirmation instead.

## 2. GuestIdentity

Represents someone using the app without a full account.

```text
GuestIdentity
- id
- guestCode
- displayName
- deviceIdHash / localGuestToken
- legalAgeConfirmedAt
- legalAgeRegion
- termsAcceptedAt
- termsVersionAccepted
- createdAt
- updatedAt
- lastSeenAt
- expiresAt
- convertedUserId
```

Guests should be able to join quickly, rejoin without duplication, and later claim history/media by creating an account.

## 3. Device

Represents a phone/browser device.

```text
Device
- id
- userId
- guestIdentityId
- platform: ios / android / web
- pushToken
- appVersion
- notificationPermissionStatus: granted / denied / provisional / unknown
- lastActiveAt
- createdAt
- updatedAt
```

Important for phone-level notifications, vibration/sound settings, background alerts, and future persistent timer notifications.

## 4. UserNotificationPreferences

Global notification preferences for a registered user.

```text
UserNotificationPreferences
- id
- userId
- shotStartNotificationEnabled
- preShotWarningEnabled
- preShotWarningSeconds
- soundEnabled
- vibrationEnabled
- notificationOnlyMode
- preferredAlertMode: sound / vibration / notification_only / muted
- persistentTimerNotificationEnabled
- createdAt
- updatedAt
```

## 5. PartySession

Represents one Shot O'Clock game.

```text
PartySession
- id
- name
- hostPlayerId
- hostUserId
- joinCode
- joinCodeExpiresAt
- status: lobby / active / paused / ended / expired / cancelled
- visibility: invite_code_only / private
- isLocked
- currentRoundNumber
- currentPhase: lobby / countdown / shot_window / referee_confirmation / host_review / round_complete / ended
- phaseStartedAt
- phaseEndsAt
- pausedAt
- totalPausedSeconds
- startedAt
- endedAt
- createdAt
- updatedAt
```

Critical timer rule:

```text
timeRemaining = phaseEndsAt - currentServerTime
```

The timer must be based on shared server/session timestamps. Each phone must not run an independent source-of-truth timer.

## 6. PartySettings

Rules chosen by the host.

```text
PartySettings
- id
- partySessionId

Timer Settings
- startingIntervalSeconds
- intervalIncrementSeconds
- maxIntervalSeconds
- shotWindowSeconds
- refereeConfirmationWindowSeconds
- autoStartNextRound
- autoStartDelaySeconds

Game Rules
- eliminationEnabled
- graceMode: disabled / enabled / unlimited
- manualPardonsEnabled
- allowPlayerOptOut
- allowOutPlayersAsReferees
- allowHostAsPlayer

Referee Settings
- refereeMode: none / assigned_monitor / referee_pool
- requireRefereeConfirmation
- allowQuestionableVerdict
- autoApproveWithoutReferee
- autoApproveIfAllPlayersDone
- hostReviewRequired

Admin Settings
- allowAssignedAdmins
- adminsCanPauseTimer
- adminsCanAddTime
- adminsCanFinalizeRounds
- adminsCanOverrideOutcomes
- adminsCanRemovePlayers

Join Settings
- allowGuests
- requireAgeConfirmation
- requireTermsAcceptance
- allowLateJoin
- lockPartyOnStart
- allowRejoin

Alert Settings
- sessionSoundMode: host_only / everyone / muted / vibration_only
- allowPlayerSoundOverride
- preShotWarningEnabled
- preShotWarningSeconds
- persistentTimerNotificationEnabled

Timestamps
- createdAt
- updatedAt
```

### Grace Mode Meaning

```text
disabled = no grace
enabled = one automatic grace
unlimited = missed rounds do not eliminate players
```

UI language:

- No Grace
- Grace
- Unlimited Grace

## 7. PartyPlayer

Represents a person inside a specific party. This is separate from User.

```text
PartyPlayer
- id
- partySessionId
- userId
- guestIdentityId
- displayName
- avatarUrl

Permission Role
- permissionRole: host / admin / player

Game Status
- status: active / out / removed

Game Duty
- duty: normal_player / assigned_monitor / referee_pool / spectator

Out Tracking
- outReason: missed_round / self_opted_out / host_marked_out / missed_after_grace / left_game
- outRoundNumber
- outAt

Grace Tracking
- usedGrace
- usedGraceAt
- usedGraceRoundNumber
- totalMissedRounds

Admin Tracking
- promotedByPlayerId
- promotedAt
- demotedAt

Session Tracking
- isReady
- joinedAt
- leftAt
- lastSeenAt
- rejoinedAt

Stats
- totalShotsCompleted
- totalRoundsMissed
- totalPardonsReceived

Removal
- removedAt
- removedByPlayerId
- removedReason

Timestamps
- createdAt
- updatedAt
```

Locked design decision:

```text
permissionRole = host / admin / player
status = active / out / removed
duty = normal_player / assigned_monitor / referee_pool / spectator
```

This prevents role/status confusion later.

Example:

```text
permissionRole = admin
status = active
duty = normal_player
```

This player is still playing, but can help manage the game.

Example:

```text
permissionRole = player
status = out
duty = referee_pool
```

This player is out of the game, but is helping as a referee.

## 8. PartyPlayerNotificationSettings

Party-specific notification preferences.

```text
PartyPlayerNotificationSettings
- id
- partySessionId
- partyPlayerId
- phoneNotificationsEnabled
- shotStartNotificationEnabled
- preShotWarningEnabled
- preShotWarningSeconds
- soundEnabled
- vibrationEnabled
- notificationOnlyMode
- muted
- persistentTimerNotificationEnabled
- createdAt
- updatedAt
```

Host settings control the session. Player settings control personal device behavior within those limits.

## 9. Round

Represents one timer cycle.

```text
Round
- id
- partySessionId
- roundNumber
- intervalSeconds
- shotWindowSeconds
- refereeConfirmationWindowSeconds
- status: scheduled / countdown / shot_window / referee_confirmation / host_review / completed / skipped / cancelled
- countdownStartedAt
- countdownEndsAt
- shotWindowStartedAt
- shotWindowEndsAt
- refereeWindowStartedAt
- refereeWindowEndsAt
- completedAt
- createdAt
- updatedAt
```

Relationships:

```text
PartySession has many Rounds
Round has many RoundPlayerOutcomes
Round has many RefereeAssignments
Round has many RefereeVerdicts
```

## 10. RoundPlayerOutcome

Tracks what happened to one player in one round.

```text
RoundPlayerOutcome
- id
- roundId
- partySessionId
- partyPlayerId
- roundNumber

Player Action
- playerAction: none / done / self_out / missed
- playerTappedDoneAt
- playerMarkedSelfOutAt

Referee Result
- refereeVerdict: pending / confirmed / missed / questionable / not_required
- refereeVerdictAt
- refereePlayerId

Host/Admin Final Result
- finalOutcome: pending / completed / missed / grace_used / pardoned / out / self_out / overridden
- finalizedByPlayerId
- finalizedAt

Grace/Pardon
- graceApplied
- graceAppliedAt
- pardoned
- pardonedByPlayerId
- pardonedAt

Game Impact
- statusBeforeRound
- statusAfterRound
- eliminatedThisRound

Metadata
- notes
- createdAt
- updatedAt
```

This model is critical. Do not only update `PartyPlayer.status` and lose history.

## 11. RefereeAssignment

Used when referee mode assigns specific people.

```text
RefereeAssignment
- id
- partySessionId
- roundId
- roundNumber
- refereePlayerId
- targetPlayerId
- assignmentType: assigned_monitor / referee_pool_claim
- status: assigned / completed / skipped / expired
- createdAt
- completedAt
```

## 12. RefereeVerdict

Tracks the actual confirmation decision.

```text
RefereeVerdict
- id
- partySessionId
- roundId
- roundNumber
- refereePlayerId
- targetPlayerId
- verdict: confirmed / missed / questionable
- verdictAt
- source: assigned_monitor / referee_pool / host / admin
- notes
- createdAt
- updatedAt
```

Separate from RefereeAssignment because pool mode needs flexibility.

## 13. AdminActionLog

Tracks actions made by host/admins.

```text
AdminActionLog
- id
- partySessionId
- actorPlayerId
- actorPermissionRole: host / admin
- affectedPlayerId
- roundId
- roundNumber
- actionType:
  - pause_timer
  - resume_timer
  - add_time
  - skip_to_shot_window
  - end_shot_window
  - finalize_round
  - override_outcome
  - mark_player_out
  - mark_player_active
  - reinstate_player
  - give_pardon
  - remove_pardon
  - reset_grace_used
  - remove_player
  - promote_admin
  - demote_admin
  - lock_party
  - unlock_party
  - transfer_host
  - end_party
- previousValue
- newValue
- reason
- createdAt
```

Without this, debugging state changes later will be painful.

## 14. TimerEvent

Tracks timer-specific transitions and changes.

```text
TimerEvent
- id
- partySessionId
- roundId
- roundNumber
- eventType:
  - countdown_started
  - shot_window_started
  - referee_window_started
  - timer_paused
  - timer_resumed
  - time_added
  - phase_skipped
  - round_completed
  - next_round_started
- previousPhase
- newPhase
- previousEndsAt
- newEndsAt
- secondsAdded
- triggeredBy: system / host / admin
- triggeredByPlayerId
- createdAt
```

## 15. PartyInvite

Useful later; can be part of PartySession in MVP.

```text
PartyInvite
- id
- partySessionId
- joinCode
- status: active / expired / revoked
- maxUses
- useCount
- expiresAt
- createdByPlayerId
- createdAt
- updatedAt
```

## 16. TermsAcceptance

Useful for legal-age and terms tracking.

```text
TermsAcceptance
- id
- userId
- guestIdentityId
- partySessionId
- termsVersion
- privacyPolicyVersion
- legalAgeConfirmed
- legalAgeRegion
- acceptedAt
- ipAddressHash
- userAgent
```

## 17. PartyRulesSnapshot

Stores the rules used for a party.

```text
PartyRulesSnapshot
- id
- partySessionId
- rulesText
- settingsSnapshot
- createdAt
```

This matters if default rules change later.

## 18. PartyRecap

Generated after a party ends.

```text
PartyRecap
- id
- partySessionId
- totalPlayers
- totalRounds
- totalShotsCompleted
- winnerPlayerId
- longestLastingPlayerIds
- endedReason: host_ended / all_players_out / expired
- recapGeneratedAt
- shareImageUrl
- createdAt
- updatedAt
```

## 19. PlayerPartyStats

A summary of one player's performance in one party.

```text
PlayerPartyStats
- id
- partySessionId
- partyPlayerId
- roundsParticipated
- shotsCompleted
- shotsMissed
- graceUsed
- pardonsReceived
- timesReinstated
- finalStatus: active / out / removed
- outRoundNumber
- rank
- createdAt
- updatedAt
```

Stats are not the point of the app, but lightweight party-specific summaries can help recaps.

## 20. PartyAlbum

Future flagship feature.

```text
PartyAlbum
- id
- partySessionId
- title
- visibility: party_only / host_only / shared_link
- uploadsEnabled
- hostApprovalRequired
- createdAt
- updatedAt
```

## 21. PartyMediaItem

Represents uploaded party photos/videos.

```text
PartyMediaItem
- id
- partyAlbumId
- partySessionId
- uploadedByPlayerId
- uploadedByUserId
- mediaType: photo / video
- storageUrl
- thumbnailUrl
- fileName
- fileSizeBytes
- durationSeconds
- width
- height
- caption
- moderationStatus: visible / pending_review / removed / reported
- uploadedAt
- removedAt
- removedByPlayerId
- createdAt
- updatedAt
```

## 22. MediaReport

Needed if users can upload media.

```text
MediaReport
- id
- partyMediaItemId
- reportedByPlayerId
- reason: inappropriate / privacy / harassment / other
- details
- status: open / reviewed / dismissed / action_taken
- createdAt
- reviewedAt
- reviewedByUserId
```

If albums exist, reporting/removal must exist.

## 23. SessionEvent

General session timeline.

```text
SessionEvent
- id
- partySessionId
- roundId
- partyPlayerId
- eventType:
  - player_joined
  - player_left
  - player_rejoined
  - player_marked_done
  - player_self_out
  - player_eliminated
  - player_became_referee
  - media_uploaded
  - party_started
  - party_ended
- eventData
- createdAt
```

Do not use this as the only source of truth unless intentionally building event sourcing, which is overkill right now.

## Core Relationships

```text
User 1 -> many PartyPlayers
GuestIdentity 1 -> many PartyPlayers
PartySession 1 -> many PartyPlayers
PartySession 1 -> 1 PartySettings
PartySession 1 -> many Rounds
Round 1 -> many RoundPlayerOutcomes
Round 1 -> many RefereeAssignments
Round 1 -> many RefereeVerdicts
PartySession 1 -> many AdminActionLogs
PartySession 1 -> many TimerEvents
PartySession 1 -> 0/1 PartyRecap
PartySession 1 -> 0/1 PartyAlbum
PartyAlbum 1 -> many PartyMediaItems
PartyMediaItem 1 -> many MediaReports
```

## MVP-Critical Models

1. User or anonymous identity support
2. GuestIdentity
3. Device
4. PartySession
5. PartySettings
6. PartyPlayer
7. PartyPlayerNotificationSettings
8. Round
9. RoundPlayerOutcome
10. AdminActionLog
11. TimerEvent

Referee models become necessary as soon as referee mode starts.

## Future / Later Models

1. PartyAlbum
2. PartyMediaItem
3. MediaReport
4. PartyRecap
5. PlayerPartyStats
6. TermsAcceptance
7. PartyInvite
8. PartyRulesSnapshot
9. SessionEvent

## Step 3 Summary

Shot O'Clock's data model is centered around a party session where each participant is represented as a PartyPlayer with separate concepts for:

```text
permissionRole = host/admin/player
status = active/out/removed
duty = normal/referee/spectator
```

This is the most important modeling decision because it prevents role/status confusion later.

---

