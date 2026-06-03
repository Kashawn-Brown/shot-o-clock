> **Deprecated:** The planning blueprint served its purpose and is no longer maintained as of 2026-06-03. Product context now lives in `plan.md` / `timeline.md`; specs in `docs/specs/` remain authoritative.

> Sliced from the master Shot O'Clock planning blueprint.
> Cross-reference: None directly — this is the product framing.
> When this doc and a spec in `docs/specs/` disagree, the spec wins (the spec is the locked implementation contract; this doc is the planning rationale that led there).

---

# Step 1: Start From Your Goal

## Project Name

**Shot O'Clock**

## Core Goal

Build a dedicated drinking-game app for legal-drinking-age groups that makes the real-life Shot O'Clock game easier, cleaner, funnier, and more organized.

The app replaces the messy manual version where people use a phone clock, try to remember who is still in, yell when it is time, and manually watch who took their shot.

## Why This App Exists

Shot O'Clock exists because this is already a real game people play informally. The app gives that game a dedicated home.

Instead of using random timers, memory, and social pressure, the app provides:

- a clear interval timer
- a loud **SHOT O'CLOCK** moment
- roster tracking
- host control
- optional monitor/referee logic later
- game history later
- eventually, party memories through photos/videos

This is also a good AI-led build candidate because it has clear rules, clear screens, and a manageable but interesting realtime flow.

## Who It Is For

Primary users:

- legal-drinking-age friend groups
- pregame groups
- house party groups
- birthday/celebration groups
- hosts running drinking games
- people who want a more official/funny way to play Shot O'Clock

The app should feel casual and fast enough for a party, not like a heavy admin tool.

## Core Value

The value is not just “a timer.”

The value is that Shot O'Clock turns a loose drinking game into a structured shared experience.

It helps groups:

- stay synced
- know when the round is happening
- know who is still active
- reduce confusion
- reduce host burden
- make eliminations/reinstatements cleaner
- make the game feel more official and entertaining
- optionally use monitors/referees later to verify people fairly

The app should support both simple and more structured usage.

## Usage Modes

### 1. Bare-Bones Host Mode

Only the host uses the app. The app acts like a dedicated Shot O'Clock timer with a loud alert, timer rules, and maybe basic roster tracking.

This matches how people may naturally start using it.

### 2. Synced Group Session Mode

Everyone joins a shared session with a code.

Players can see:

- the timer
- the current round
- their status
- who is active/out
- round results
- future monitor/referee assignments

This is the stronger long-term version and the MVP architecture should support it.

## Product Direction

The app should be:

- mobile-first
- drinking-game focused
- simple and fast to use
- loud, visual, and party-friendly
- usable by guests without full signup
- protected by session/join codes
- controlled by the host
- built with legal-age confirmation and terms
- planned tightly, then implemented with AI in small chunks

The product should not become a generic party app too early.

The core identity is:

> A dedicated Shot O'Clock drinking-game timer and roster/referee app.

## Safety and Access Direction

Because this is alcohol-related, the app should include basic responsible-use boundaries:

- legal-drinking-age confirmation
- terms/consent checkbox
- guest users must also confirm they are legal drinking age
- app does not provide, sell, or deliver alcohol
- users are responsible for their own choices
- hosts control their sessions
- sessions require an invite/join code

This protects the app without weakening the product identity.

## Future Flagship Feature: Party Albums

Photo/video albums should be treated as a major future feature.

The idea:

After or during a Shot O'Clock session, users can upload photos/videos into that party's album.

Example:

> “Amy's 21st Birthday”

Inside that saved party, users could later see:

- photos/videos from the night
- who participated
- who lasted the longest
- basic shot/round history
- memorable moments
- downloadable/shareable media

This could become a strong consumer hook because it turns the app from a one-night utility into a memory product.

But it should not be in the first MVP because it adds complexity:

- media storage
- uploads
- privacy
- moderation
- downloads
- sharing
- permissions
- storage cost

Planning note:

> The MVP should not build party albums first, but the data model and session model should leave room for saved party history and future media attachments.

## Project Type

This project is:

- a fun side project
- an AI-led/vibe-coding experiment
- a portfolio project
- potentially a real app-store product later

The first goal is not to build a massive startup. The first goal is to plan it clearly, build a clean MVP, and prove that the core game experience works.

## Step 1 Summary

Shot O'Clock is a mobile-first drinking-game app for legal-age groups. It starts as a dedicated interval timer and roster system for the real Shot O'Clock game, then can grow into a synced session app with monitors/referees, host controls, saved party history, and eventually photo/video party albums.

---

