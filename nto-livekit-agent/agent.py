import json
import os
import time
import asyncio
import traceback
from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import Agent, AgentServer, AgentSession, JobContext, cli
from livekit.plugins import openai, runway, elevenlabs

load_dotenv()

_C = {
    "blue":    "\033[1;34m",  # room events
    "cyan":    "\033[1;36m",  # STT / user conversation
    "magenta": "\033[1;35m",  # agent conversation
    "dim":     "\033[2m",     # time elapsed
    "reset":   "\033[0m",     # reset color
    "orange":  "\033[1;33m",  # LWC text input message
}

server = AgentServer()

@server.rtc_session(agent_name=os.getenv("LIVEKIT_AGENT_NAME", "nto-agent"))
async def my_agent(ctx: JobContext):
    print(f"{_C['blue']}[JOB]{_C['reset']} Job received — connecting...", flush=True)

    try:
        await ctx.connect()
    except Exception as e:
        print(f"[ERROR] ctx.connect() failed: {e}", flush=True)
        traceback.print_exc()
        return

    print(f"{_C['blue']}[ROOM]{_C['reset']} Connected: {ctx.room.name}", flush=True)

    try:
        voice_id = os.getenv("ELEVENLABS_VOICE_ID")
        if not voice_id:
            raise ValueError("ELEVENLABS_VOICE_ID is not set in your .env file")

        def _publish(payload: dict):
            asyncio.get_event_loop().create_task(ctx.room.local_participant.publish_data(
                json.dumps(payload).encode(), reliable=True
            ))

        session = AgentSession(
            stt=openai.STT(),
            tts=elevenlabs.TTS(
                api_key=os.getenv("ELEVEN_API_KEY"),
                model=os.getenv("ELEVENLABS_MODEL", "eleven_multilingual_v2"),
                voice_id=voice_id,
                apply_text_normalization="on",
                language="en",
                voice_settings=elevenlabs.VoiceSettings(
                    stability=0.80,
                    similarity_boost=0.75,
                    style=0.0,
                    use_speaker_boost=True,
                ),
            ),
        )
        session.input.set_audio_enabled(False)

        if not os.getenv("RUNWAYML_API_SECRET"):
            raise ValueError("RUNWAYML_API_SECRET is not set in your .env file")
        runway_avatar_id = os.getenv("RUNWAY_AVATAR_ID")
        if not runway_avatar_id:
            raise ValueError("RUNWAY_AVATAR_ID is not set in your .env file")

        welcome_message = os.getenv("WELCOME_MESSAGE", "")

        # Avatar lifecycle is per-browser-connection, not per-job
        _avatar = {"ref": None}
        _browser_active = {"on": False}
        _shutting_down = {"on": False}
        _avatar_tts_ready = asyncio.Event()
        _avatar_start_lock = asyncio.Lock()

        # Streaming TTS: one asyncio.Queue per active messageId
        _stream_queues: dict[str, asyncio.Queue] = {}

        async def _speak_stream(message_id: str, q: asyncio.Queue):
            try:
                await asyncio.wait_for(_avatar_tts_ready.wait(), timeout=120.0)
            except asyncio.TimeoutError:
                print("[WARN] Avatar video not ready after 120s, skipping stream TTS", flush=True)
                _publish({"type": "speech_finished"})
                _stream_queues.pop(message_id, None)
                return
            while _browser_active["on"]:
                item = await q.get()
                if item is None:  # end sentinel — all chunks spoken
                    break
                try:
                    await session.say(item)
                except RuntimeError:
                    break
            _publish({"type": "speech_finished"})
            _stream_queues.pop(message_id, None)

        async def _start_avatar():
            async with _avatar_start_lock:
                if _avatar["ref"] is not None:
                    return
                new_avatar = runway.AvatarSession(avatar_id=runway_avatar_id)
                try:
                    await new_avatar.start(session, room=ctx.room)
                except Exception as exc:
                    print(f"[ERROR] failed to start Runway avatar: {exc}", flush=True)
                    traceback.print_exc()
                    _publish({"type": "avatar_error", "message": str(exc)})
                    return
                _avatar["ref"] = new_avatar
                print(f"{_C['blue']}[ROOM]{_C['reset']} Avatar started", flush=True)

        async def _stop_avatar():
            _avatar_tts_ready.clear()
            ref = _avatar["ref"]
            _avatar["ref"] = None
            if ref:
                try:
                    await ref.aclose()
                except Exception as exc:
                    print(f"[WARN] avatar.aclose() failed: {exc}", flush=True)
            print(f"{_C['blue']}[ROOM]{_C['reset']} Avatar stopped", flush=True)

        # — Room events ————————————————————————————————————————————————————

        @ctx.room.on("track_published")
        def on_track_published(publication, participant):
            if (participant.attributes.get("lk.publish_on_behalf") == ctx.room.local_participant.identity
                    and publication.kind == rtc.TrackKind.KIND_VIDEO):
                print(f"{_C['blue']}[ROOM]{_C['reset']} Avatar video track live", flush=True)
                _avatar_tts_ready.set()
                _publish({"type": "agent_ready"})
                if welcome_message:
                    async def _welcome():
                        try:
                            await session.say(welcome_message)
                        except RuntimeError:
                            pass
                        _publish({"type": "speech_finished"})
                    asyncio.create_task(_welcome())

        # Avatar worker may have published before this handler was registered
        for _p in ctx.room.remote_participants.values():
            if _p.attributes.get("lk.publish_on_behalf") == ctx.room.local_participant.identity:
                for _pub in _p.track_publications.values():
                    if _pub.kind == rtc.TrackKind.KIND_VIDEO:
                        _avatar_tts_ready.set()
                        _publish({"type": "agent_ready"})

        @ctx.room.on("participant_connected")
        def on_participant_connected(participant):
            print(f"{_C['blue']}[ROOM]{_C['reset']} Participant joined: {participant.identity}", flush=True)
            if participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_STANDARD:
                if _shutting_down["on"]:
                    return  # old job is exiting; ignore until room connection closes
                _browser_active["on"] = True
                asyncio.create_task(_start_avatar())

        @ctx.room.on("participant_disconnected")
        def on_participant_disconnected(participant):
            print(f"{_C['blue']}[ROOM]{_C['reset']} Participant left: {participant.identity}", flush=True)
            if participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_STANDARD:
                # Browser left — flag shutdown and disconnect from room to end this job.
                # The framework's close_on_disconnect=True already shuts down the AgentSession;
                # ctx.room.disconnect() ends the room connection so the job process exits.
                _browser_active["on"] = False
                _shutting_down["on"] = True
                async def _teardown():
                    await _stop_avatar()
                    await ctx.room.disconnect()
                asyncio.create_task(_teardown())
            elif (_browser_active["on"]
                    and participant.attributes.get("lk.publish_on_behalf") == ctx.room.local_participant.identity):
                # Avatar worker disconnected while browser is still here — restart regardless of ready state
                _avatar_tts_ready.clear()
                _avatar["ref"] = None
                asyncio.create_task(_start_avatar())

        @ctx.room.on("data_received")
        def on_text_from_chat(data_packet):
            try:
                msg = json.loads(data_packet.data.decode("utf-8"))
                if msg.get("type") == "agent_text":
                    text = msg.get("text", "")
                    if text:
                        async def _speak_and_notify(t: str = text):
                            try:
                                await asyncio.wait_for(_avatar_tts_ready.wait(), timeout=120.0)
                            except asyncio.TimeoutError:
                                print("[WARN] Avatar video not ready after 120s, skipping TTS", flush=True)
                                _publish({"type": "speech_finished"})
                                return
                            if not _browser_active["on"]:
                                return
                            try:
                                await session.say(t)
                            except RuntimeError:
                                return
                            _publish({"type": "speech_finished"})
                        asyncio.create_task(_speak_and_notify())
                elif msg.get("type") == "agent_text_chunk":
                    text = msg.get("text", "")
                    message_id = msg.get("messageId", "")
                    if text and message_id and _browser_active["on"]:
                        if message_id not in _stream_queues:
                            q: asyncio.Queue = asyncio.Queue()
                            _stream_queues[message_id] = q
                            asyncio.create_task(_speak_stream(message_id, q))
                        _stream_queues[message_id].put_nowait(text)
                elif msg.get("type") == "agent_stream_end":
                    message_id = msg.get("messageId", "")
                    if message_id in _stream_queues:
                        _stream_queues[message_id].put_nowait(None)
                elif msg.get("type") == "voice_mode":
                    enabled = bool(msg.get("enabled", False))
                    session.input.set_audio_enabled(enabled)
                    print(f"{_C['blue']}[VOICE MODE]{_C['reset']} {'ON' if enabled else 'OFF'}")
            except Exception as e:
                print(f"{_C['dim']}[DATA ERR] {e}{_C['reset']}")

        # — Voice path (microphone) ————————————————————————————————————————

        _speech_started_at: dict[str, float] = {}

        @session.on("user_state_changed")
        def on_user_state_changed(ev):
            new_state = getattr(ev, "new_state", None)
            if new_state == "speaking":
                _speech_started_at["t"] = time.perf_counter()

        @session.on("user_input_transcribed")
        def on_transcribed(ev):
            if ev.is_final:
                elapsed = ""
                if "t" in _speech_started_at:
                    stt_ms = (time.perf_counter() - _speech_started_at["t"]) * 1000
                    elapsed = f" {_C['dim']}({stt_ms:.0f}ms){_C['reset']}"
                print(f"{_C['cyan']}[STT]{_C['reset']} {ev.transcript!r}{elapsed}")
                _publish({"type": "user_transcript", "text": ev.transcript})

        agent = Agent(instructions="")
        await session.start(agent=agent, room=ctx.room)
        print(f"{_C['blue']}[ROOM]{_C['reset']} Agent ready — waiting for browser participant", flush=True)

        # Start avatar if browser is already in the room when agent connects
        for _p in ctx.room.remote_participants.values():
            if _p.kind == rtc.ParticipantKind.PARTICIPANT_KIND_STANDARD:
                _browser_active["on"] = True
                asyncio.create_task(_start_avatar())
                break

    except Exception as e:
        print(f"[ERROR] Agent setup failed: {e}", flush=True)
        traceback.print_exc()


if __name__ == "__main__":
    cli.run_app(server)
