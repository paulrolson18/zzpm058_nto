# NTO Agent — Lifecycle & Observability Guide

## Agent lifecycle

Each user session follows a strict one-job-one-room lifecycle. Every time the user clicks
"Speak to Carter", a fresh agent job is dispatched and a fresh Runway avatar session is started.
When the user hangs up, everything shuts down cleanly so the next connection starts from a known
good state.

```
USER CLICKS "SPEAK TO CARTER"
  │
  ├─ Frontend fetches a LiveKit token + room name (runway-{usid})
  ├─ Frontend calls CreateDispatch → LiveKit dispatches one NTO agent job
  │
  ▼
AGENT JOB STARTS
  ├─ ctx.connect()       → agent joins the LiveKit room
  ├─ AgentSession starts → STT (OpenAI) + TTS (ElevenLabs) pipeline is live
  ├─ Agent waits for a STANDARD (browser) participant
  │
  ▼
BROWSER JOINS ROOM
  ├─ on_participant_connected fires
  ├─ _start_avatar() acquires asyncio.Lock → only one call proceeds
  │   └─ runway.AvatarSession.start() → Runway dispatches its own worker
  │
  ▼
RUNWAY AVATAR WORKER JOINS & STABILIZES
  ├─ on_track_published fires when the avatar's video track is live
  ├─ _avatar_tts_ready.set() → TTS path is unblocked
  ├─ agent_ready published to browser → frontend shows the avatar video
  ├─ Agent calls session.say(WELCOME_MESSAGE) → Carter speaks the greeting
  ├─ speech_finished published → frontend unlocks the mic button
  ├─ voice_mode: true sent → STT starts listening
  │
  ▼
CONVERSATION IN PROGRESS
  ├─ User speaks → STT transcribes → agent replies via LLM + TTS
  ├─ Frontend sends agent_text → agent calls session.say() for scripted lines
  │
  ├─ [OPTIONAL] If runway-avatar-agent unexpectedly disconnects mid-session
  │   (Runway timeout or startup bounce):
  │   └─ on_participant_disconnected fires (AGENT kind, lk.publish_on_behalf matches)
  │       └─ _avatar_tts_ready.clear(), _avatar["ref"] = None
  │           └─ _start_avatar() restarts the avatar transparently
  │               └─ once track is live again → _avatar_tts_ready.set() → resumes
  │
  ▼
USER CLICKS "HANG UP" (browser disconnects)
  ├─ on_participant_disconnected fires (STANDARD kind)
  ├─ _browser_active["on"] = False
  ├─ _shutting_down["on"]  = True   ← blocks any stale reconnect from this job
  ├─ _teardown() runs asynchronously:
  │   ├─ _stop_avatar() → runway.AvatarSession.aclose() → avatar worker leaves room
  │   └─ ctx.room.disconnect() → agent leaves room → job process exits
  │
  └─ Framework also fires close_on_disconnect=True → AgentSession.shutdown()
     (both paths run; job exits cleanly either way)

USER CLICKS "SPEAK TO CARTER" AGAIN
  ├─ Frontend fetches a new token → CreateDispatch → new agent job
  └─ Repeat from top — single fresh instance, no shared state
```

### Key invariants

| Invariant | How it is enforced |
|---|---|
| Exactly one agent job per room | Agent calls `ctx.room.disconnect()` when browser leaves; frontend dispatches unconditionally on each token request |
| Exactly one `runway.AvatarSession` per job | `asyncio.Lock` inside `_start_avatar()` serialises concurrent callers |
| Agent job lifetime = browser session | `close_on_disconnect=True` (framework default) + `ctx.room.disconnect()` on browser leave |
| Stale job cannot handle a quick reconnect | `_shutting_down` flag; `on_participant_connected` returns early if set |
| Avatar restart on mid-session failure | `on_participant_disconnected` restarts avatar whenever it disconnects while browser is present, regardless of `_avatar_tts_ready` state |

---

## Expected log messages

The following warnings and errors appear in normal operation. None of them indicate a broken
session or require intervention.

---

### `closing agent session due to participant disconnect (disable via RoomInputOptions.close_on_disconnect=False)`

**Level:** INFO  
**When:** Every time the browser user hangs up.

The LiveKit Agents framework default (`close_on_disconnect=True`) shuts down the `AgentSession`
automatically when the linked participant disconnects. This message is the framework confirming
that it did so. It is expected on every clean hang-up.

---

### `Attempted to drop unknown FFI handle: N`

**Level:** WARNING — source `livekit_ffi::server`  
**When:** During session teardown, after the browser disconnects.

```
WARNING livekit - livekit_ffi::server:279 - Attempted to drop unknown FFI handle: 8
WARNING livekit - livekit_ffi::server:279 - Attempted to drop unknown FFI handle: 151
```

Two cleanup paths run concurrently when the browser disconnects:

1. The framework's `close_on_disconnect=True` shuts down the `AgentSession`, which releases
   underlying LiveKit FFI handles.
2. Our `_teardown()` calls `runway.AvatarSession.aclose()` and `ctx.room.disconnect()`, which
   also release some of the same handles.

Whichever path reaches a handle second finds it already released and logs this warning. The
resources are cleaned up correctly — the warning is purely cosmetic. The session, the avatar,
and the room connection all close cleanly.

---

### `RuntimeError: participant 'runway-avatar-agent' disconnected while waiting for track publication`

**Level:** ERROR — source `livekit.agents`  
**When:** Occasionally on the first avatar startup attempt of a new session, most commonly when
sessions are created in quick succession.

```
ERROR livekit.agents - Error in _start_task
RuntimeError: participant 'runway-avatar-agent' disconnected while waiting for track publication
```

Runway's avatar worker sometimes connects to the room, fails to stabilise internally, and
disconnects before publishing its video track. This is a Runway-side startup bounce, not a
failure in the agent code.

The agent detects this via `on_participant_disconnected` (Runway avatar disconnected while browser
is still present) and immediately restarts the avatar session. The restart succeeds within a few
seconds, the video track is published, and Carter speaks normally. Users see a slightly longer
"Connecting…" overlay but no failure.

This bounce is more likely when a new session starts within ~5 seconds of the previous one
ending. It is less common in real usage where users take longer between sessions.

---

### `ignoring text stream with topic 'lk.transcription', no callback attached`

**Level:** INFO — source `root`

The LiveKit room receives a transcription text stream from the avatar worker that the agent has
no registered handler for. These are legacy transcription events from Runway that are not used
by this agent. They are safe to ignore.

---

### `flush audio emitter due to slow audio generation`

**Level:** DEBUG — source `livekit.agents`

ElevenLabs TTS did not produce the first audio chunk within the framework's expected window, so
the audio emitter was flushed to avoid stalling the pipeline. This is a timing note, not an
error. It has no effect on the audio output.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `LIVEKIT_URL` | Yes | LiveKit Cloud WebSocket URL |
| `LIVEKIT_API_KEY` | Yes | LiveKit API key |
| `LIVEKIT_API_SECRET` | Yes | LiveKit API secret |
| `LIVEKIT_AGENT_NAME` | Yes | Agent name registered with the worker (default: `nto-agent`) |
| `ELEVENLABS_VOICE_ID` | Yes | ElevenLabs voice ID for Carter |
| `ELEVEN_API_KEY` | Yes | ElevenLabs API key |
| `ELEVENLABS_MODEL` | No | ElevenLabs model (default: `eleven_multilingual_v2`) |
| `RUNWAYML_API_SECRET` | Yes | Runway ML API secret |
| `RUNWAY_AVATAR_ID` | Yes | Runway avatar ID for Carter |
| `WELCOME_MESSAGE` | No | Greeting spoken when Carter first appears. If empty, no greeting is spoken and the frontend must trigger speech via `agent_text`. |
