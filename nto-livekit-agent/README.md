# NTO LiveKit Agent

LiveKit voice agent using OpenAI STT, ElevenLabs TTS, and Runway avatar.

## Prerequisites

- Python 3.9+
- A [LiveKit Cloud](https://livekit.io) project (URL, API key, secret)
- API keys for OpenAI, ElevenLabs, and RunwayML

## Setup

```bash
python -m venv venv
source venv/bin/activate      # macOS/Linux
# venv\Scripts\activate       # Windows
pip install -r requirements.txt
```

## Configuration

Copy `.env.example` to `.env` and fill in each value:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `LIVEKIT_URL` | LiveKit server URL (e.g. `wss://your-project.livekit.cloud`) |
| `LIVEKIT_API_KEY` | LiveKit API key |
| `LIVEKIT_API_SECRET` | LiveKit API secret |
| `LIVEKIT_AGENT_NAME` | Dispatch name for this agent (default: `nto-agent`) |
| `OPENAI_API_KEY` | OpenAI API key (used for STT) |
| `ELEVENLABS_API_KEY` | ElevenLabs API key |
| `ELEVENLABS_VOICE_ID` | ElevenLabs voice ID |
| `ELEVENLABS_MODEL` | ElevenLabs model (default: `eleven_flash_v2_5`) |
| `RUNWAYML_API_SECRET` | RunwayML API secret |
| `RUNWAY_AVATAR_ID` | Runway avatar ID |
| `WELCOME_MESSAGE` | First message the agent speaks when a user joins (optional) |

## Running the agent

```bash
# Development — auto-restarts on file changes
python agent.py dev

# Production
python agent.py start
```

Once running, the agent connects to LiveKit and waits for jobs dispatched to the value of `LIVEKIT_AGENT_NAME`.

## Deploying the agent

`livekit.toml` configures the deployment target. It pins the LiveKit Cloud project (`subdomain`) and the agent ID (`agent.id`) so that `lk agent deploy .` always pushes to the correct cloud agent without additional flags.

```bash
# Deploy to LiveKit Cloud
lk agent deploy .
```

Requires the [LiveKit CLI](https://docs.livekit.io/home/cli/cli-setup/) (`lk`) to be installed and authenticated.
