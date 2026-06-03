> **Deprecated:** The planning blueprint served its purpose and is no longer maintained as of 2026-06-03. Product context now lives in `plan.md` / `timeline.md`; specs in `docs/specs/` remain authoritative.

> Sliced from the master Shot O'Clock planning blueprint.
> Cross-reference: See `docs/specs/game-rules.md` and `docs/specs/mvp-state-machine.md` for which of these stories are MVP and how they are implemented.
> When this doc and a spec in `docs/specs/` disagree, the spec wins (the spec is the locked implementation contract; this doc is the planning rationale that led there).

---

# Step 2: User Stories

## Purpose of This Step

The goal of Step 2 is to list what users should be able to do in the app from their perspective.

These are not all MVP requirements. This is the broader user-story inventory. Step 4 cuts this down hard.

## 1. Access, Safety, and Onboarding

1. As a new user, I want to understand what Shot O'Clock is immediately, so I know I am using a drinking-game timer app.
2. As a user, I want to confirm that I am of legal drinking age, so the app has a clear responsible-use boundary.
3. As a guest user, I want to join without creating a full account, so I can start playing quickly.
4. As a registered user, I want to create an account, so I can save my parties, stats, and history later.
5. As a guest user, I want to enter a display name, so other players can identify me.
6. As a user, I want to accept the rules/terms before joining, so everyone understands the game involves alcohol and participation is voluntary.
7. As a user, I want to view Shot O'Clock rules/instructions at any time, so I understand how the game works.
8. As a player, I want to optionally add an avatar/selfie later, so people can recognize me more easily during referee/monitoring flows.

## 2. Party Creation and Host Setup

9. As a host, I want to create a new Shot O'Clock party, so my group can play together.
10. As a host, I want to name the party, so it can be remembered later.
11. As a host, I want to generate a join code, so players can enter the correct party.
12. As a host, I want the party protected by an invite/join code, so random users cannot join.
13. As a host, I want to set the starting interval, so the game begins at the pace we choose.
14. As a host, I want to set the interval increment value, so the timer can increase by 1 minute, 2 minutes, or another amount each round.
15. As a host, I want to set the shot window length, so players have a clear amount of time to take their shot.
16. As a host, I want to choose whether players can be eliminated, so the game can be competitive or casual.
17. As a host, I want to choose whether grace is enabled, disabled, or unlimited, so the group can control game strictness.
18. As a host, I want to choose whether referee/monitor mode is enabled later, so the group can decide how serious verification should be.
19. As a host, I want to choose the notification/sound behavior for the session, so the app fits the party environment.
20. As a host, I want to decide whether only the host device plays the main Shot O'Clock sound, so one phone can act as the main speaker/timer.

## 3. Player Joining and Lobby

21. As a player, I want to enter a join code, so I can join my group's party.
22. As a player, I want to see the party name before joining, so I know I am entering the right session.
23. As a player, I want to see the basic rules/settings before the game starts, so I understand how the session will work.
24. As a player, I want to see the lobby roster, so I know who has joined.
25. As a host, I want to see who has joined before starting, so I can confirm the group is ready.
26. As a host, I want to remove a player from the lobby, so I can fix mistakes or deal with unwanted users.
27. As a player, I want to leave before the game starts, so I am not forced into the session.
28. As a guest player, I want my identity to persist during the session, so I do not duplicate myself if I disconnect and rejoin.

## 4. Main Timer and Round Flow

29. As a host, I want to start the game, so the first countdown begins.
30. As a player, I want to see a synced countdown timer, so everyone knows when Shot O'Clock is coming.
31. As a player, I want the timer to stay synced across devices, so nobody has a different version of the game state.
32. As a player, I want the default game screen to be simple, so I can quickly see the important information.
33. As a player, I want the main screen to show party name, current round/shot number, countdown timer, and current phase, so I know what is happening.
34. As a user, I want the app to show a loud full-screen **SHOT O'CLOCK** moment when the countdown ends, so the round feels clear and exciting.
35. As a user, I want a distinct Shot O'Clock alarm/sound, so the moment feels like part of the game.
36. As a host, I want the app to automatically move from countdown into shot window, so I do not have to manually manage every transition.
37. As a host, I want the app to advance to the next round after results are handled, so the game keeps moving.
38. As a player, I want to see the current round/shot number, so I understand where we are in the game.
39. As a player, I want to see the next interval length, so I know how long until the next Shot O'Clock moment.

## 5. Host Timer Controls

40. As a host, I want to pause the timer, so I can handle interruptions.
41. As a host, I want to resume the timer, so the game can continue after a pause.
42. As a host, I want to add time to the active timer, so I can adjust when the party needs more time.
43. As a host, I want to skip to the shot window, so I can manually trigger Shot O'Clock when needed.
44. As a host, I want to end the shot window early, so we can move on if everyone is finished.
45. As a host, I want to manually move the game forward, so the app does not trap the group in a rigid flow.
46. As a host, I want admin controls separate from the main player screen, so I can manage the game without cluttering the basic view.

## 6. Player Actions During the Game

47. As a player, I want to tap **Done** during the shot window, so I can mark that I took my shot.
48. As a player, I want to see how much time is left in the shot window, so I know whether I am about to miss.
49. As a player, I want clear feedback after tapping Done, so I know my action registered.
50. As a player, I want to mark myself as out during the countdown, so I can stop before the next round.
51. As a player, I want to mark myself as out during the shot window, so I can clearly say I am not taking the shot.
52. As a player, I want to leave the game at any point, so I am never forced to continue.
53. As a player, I want to remain visible after opting out, so the group can still see that I was part of the session.

This is non-negotiable. The app cannot pressure people to keep drinking.

## 7. Referee / Monitor System

54. As a host, I want to enable referee mode, so shots can be verified by other people.
55. As a host, I want to choose assigned-monitor mode, so each player/referee is responsible for a specific person.
56. As a host, I want to choose referee-pool mode, so referees can confirm players from a shared list.
57. As a player, I want to see who I am monitoring, so I know my responsibility.
58. As a player, I want to see who is monitoring me, so I know who needs to confirm me.
59. As a monitor, I want to confirm my assigned player after they tap Done, so their shot is verified.
60. As a monitor, I want to mark a player as missed, so the game can enforce the rules.
61. As a monitor, I want to mark a result as questionable, so unclear cases can be reviewed by the host.
62. As a referee in pool mode, I want to see a list of players waiting for confirmation, so I can verify people efficiently.
63. As a host, I want to set a referee confirmation window, so referees have separate time to confirm shots after the shot window.
64. As an eliminated player, I want to choose whether to become a referee, so I can stay involved after being out.
65. As a host, I want eliminated players to become monitor-only/referees if they choose, so the game can keep using them socially.

## 8. No-Referee Mode

66. As a host, I want the game to work without referees, so casual groups can play with less friction.
67. As a player, if referees are disabled, I want to mark whether I took my shot or not, so the app can still track participation.
68. As a host, I want rounds to auto-approve when referee mode is off, so the game keeps moving.
69. As a host, I want to step in manually only when needed, so I do not have to approve every single action.

## 9. Host Role, Overrides, and Admin Powers

70. As a host, I want to participate as a normal player, so hosting does not stop me from playing.
71. As a host, I want admin controls in addition to normal player controls, so I can manage the game while still participating.
72. As a host, I want to override outcomes, so I can fix mistakes.
73. As a host, I want to mark someone out, so I can enforce the game rules.
74. As a host, I want to mark someone back in, so I can correct mistaken eliminations.
75. As a host, I want to give a player a pardon for a round, so I can handle exceptions without eliminating them.
76. As a host, I want to choose whether anyone is ever actually out, so the game can also be played casually.
77. As a host, I want round results to auto-approve unless I choose to step in, so the game does not slow down.
78. As a host, I want to remove inactive or disconnected players, so the session stays clean.
79. As a host, I want to lock the party after it starts, so random late users cannot join if we do not want them.
80. As a host, I want to end the party manually, so the session closes cleanly.
81. As a host, I want to promote a player to admin later, so they can help manage the party.
82. As a host, I want to demote an admin back to regular player, so I can remove their extra control.
83. As an admin, I want to pause/resume the timer and add time if allowed, so I can help run the party.
84. As a player, I want to see who the host/admins are, so I know who controls the session.

## 10. Eliminations, Grace, Pardons, and Reinstatement

85. As a host, I want players who miss a round to be marked out when elimination is enabled, so the game has stakes.
86. As a host, I want Grace to be disabled, enabled, or unlimited, so the game can match the group's strictness.
87. As a player, I want to know if my grace was used, so I understand why I am still active.
88. As a host, I want to reinstate a player from the most recent round, so I can fix mistaken eliminations.
89. As a player, I want to know if I was reinstated, so I understand why I am active again.
90. As a host/admin, I want reinstatements to be logged, so there is a record of manual changes.
91. As a host, I want reinstatement to be limited to the most recent round, so the game history does not become messy.

## 11. Roster and Status Views

92. As a host, I want to see all players and their statuses, so I know who is active, out, or removed.
93. As a player, I want to see who is still active, so I know who is left in the game.
94. As a player, I want out players to be visually greyed out, so the roster is easy to understand.
95. As a player, I want to open a roster view when needed, so the main timer screen stays clean.
96. As a player, I want active/out tab views, so I can quickly separate people still playing from people who are out.
97. As a player, I want to see previous round outcomes while the timer continues, so I can check who dropped out and when.

## 12. Round Results and History

98. As a host, I want to see a round summary after the shot window ends, so I can confirm outcomes before moving on.
99. As a host, I want to see who tapped Done, who was confirmed, and who missed, so I can make fair decisions.
100. As a host, I want to approve all results quickly, so the game does not stall.
101. As a host, I want to edit individual outcomes before finalizing the round, so errors can be fixed.
102. As a player, I want to see round results, so I know what happened.
103. As a player, I want to see when the next round starts, so I can stay ready.
104. As a player, I want to view round history during the game, so the session feels transparent.

Regular-player result display should not over-explain why someone is out. Regular players mostly need **Active** and **Out**. Host/admin can see the deeper reason if needed.

## 13. Phone-Level Notifications and Alerts

105. As a player, I want to receive a phone-level notification when Shot O'Clock starts, so I can be alerted even if I am outside the app.
106. As a player, I want to receive an optional phone-level pre-warning before Shot O'Clock, so I can prepare.
107. As a player, I want to opt in or out of pre-notifications, so I can control how much the app interrupts me.
108. As a player, I want to choose notification type, such as sound, vibration-only, or notification-only, so alerts match my preference.
109. As a user, I want to mute the Shot O'Clock alarm, so I can play without sound if needed.
110. As a user, I want to use vibration instead of sound, so I can still get alerts without playing audio.
111. As a user, I want to control the Shot O'Clock alarm volume where possible, so the alert fits the environment.
112. As a host, I want to control the session-level notification behavior, so the party can use sound, vibration, or host-only alerts.
113. As a player, I want a persistent timer-style phone notification in the future, so I can track the countdown from outside the app.

Planning note: phone-level notifications are a real implementation constraint, not just a UX detail. Persistent countdown notifications may require platform-specific handling.

## 14. Guest vs Registered User

114. As a guest, I want to join quickly without creating an account, so I can play immediately.
115. As a guest, I want my temporary identity to stay tied to the session, so I can reconnect without duplicating myself.
116. As a guest, I want the option to create an account after the party, so I can save stats/history if I want.
117. As a registered user, I want my parties saved to my account, so I can revisit them later.
118. As a registered user, I want to see my past Shot O'Clock sessions, so I can remember previous parties.
119. As a registered user, I want to see my personal history, so I can track parties I hosted or joined.

## 15. Saved Party History and Recaps

120. As a host, I want the party session to be saved, so I can view it later.
121. As a user, I want to see the final roster and outcomes, so I can remember who played.
122. As a user, I want to see round-by-round history, so the party has a record.
123. As a user, I want to see who lasted until the end, so the game has a simple recap.
124. As a user, I want to see how many rounds each person completed, so the recap feels meaningful.
125. As a user, I want to share a party recap eventually, so the session can become a social memory.

Stats are not the central point of the app. The point is the live party game and saved party memory.

## 16. Photo / Video Party Album Future Pillar

126. As a host, I want the party to have a media album, so everyone can collect memories from the night.
127. As a player, I want to upload photos/videos to the party album, so the group can see moments from the session.
128. As a player, I want to view the party album after the session, so I can relive the night.
129. As a user, I want to download photos/videos from the party album, so I can save them to my phone.
130. As a user, I want to share selected media from the party album, so I can send moments to friends.
131. As a host, I want to moderate or remove uploaded media, so the album does not become messy or inappropriate.
132. As a user, I want privacy controls for party albums, so only the group can access them.
133. As a guest, I want to contribute to the album during the party, so I can participate without creating an account.
134. As a guest, I want to claim my media later by creating an account, so I do not lose memories I uploaded.

Important note: this is not MVP, but it is a major future pillar. Design sessions and party history in a way that does not block albums later.

## 17. Recovery and Edge Cases

135. As a player, I want to reconnect if I close the app, so I can return to the active session.
136. As a player, I want the current timer state to load correctly when I rejoin, so I do not get out of sync.
137. As a host, I want the session to survive temporary app backgrounding, so the game does not break.
138. As a host, I want to recover or transfer control if my phone disconnects, so the party is not ruined.
139. As a player, I want clear messaging if the session has ended, so I know I can no longer join.
140. As a user, I want old sessions to expire or close automatically, so inactive parties do not stay open forever.

## Strongest Design Ideas From Step 2

### Multiple strictness levels

Shot O'Clock should support:

- **Casual Timer Mode:** host runs timer; no serious elimination enforcement.
- **Standard Game Mode:** players can be out; host can override; players self-mark.
- **Referee Mode:** players/referees verify shots; host only steps in when needed.

### Two referee modes

- **assigned_monitor:** “You are responsible for this specific person.”
- **referee_pool:** “Refs can confirm anyone waiting for confirmation.”

Referee pool is likely more practical in real parties.

### Main screen should be timer-first

The default player screen should not be an admin dashboard.

### Host controls should be powerful but tucked away

The host needs controls, but dangerous actions should require confirmation.

### “I'm Out” is core safety and UX

Players need a clean way to stop. No friction. No shame.

### Phone-level notifications are serious technical work

This affects mobile stack, background behavior, permissions, and iOS/Android differences.

---

