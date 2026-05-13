import grpc
import io
import logging
import os

from yandex.cloud.ai.tts.v3 import tts_pb2
from yandex.cloud.ai.tts.v3 import tts_service_pb2_grpc

from fastapi import APIRouter, Request
from fastapi.responses import Response

logging.getLogger().setLevel(logging.INFO)

config = {
    'api_key_secret' : os.environ['YANDEX_API_KEY'],
    'request_api'    : "tts.api.cloud.yandex.net:443",
}

FORMAT_MAP = {
    'WAV':      {'container': tts_pb2.ContainerAudio.WAV,      'ext': 'wav',  'mime': 'audio/wav'},
    'OGG_OPUS': {'container': tts_pb2.ContainerAudio.OGG_OPUS, 'ext': 'ogg',  'mime': 'audio/ogg'},
    'MP3':      {'container': tts_pb2.ContainerAudio.MP3,       'ext': 'mp3',  'mime': 'audio/mpeg'},
}

NORM_MAP = {
    'LUFS':     tts_pb2.UtteranceSynthesisRequest.LUFS,
    'MAX_PEAK': tts_pb2.UtteranceSynthesisRequest.MAX_PEAK,
}

router = APIRouter()


@router.post("/tts")
async def tts(request: Request):
    request_json = await request.json()

    text_value        = request_json.get("text", "Empty")
    unsafe_mode_value = len(text_value) > 249
    voice_value       = request_json.get("voice", "alexander")
    role_value        = request_json.get("role", "good")
    speed_value       = float(request_json.get("speed", 1.0))
    pitch_shift_value = float(request_json.get("pitchShift", 0))
    volume_value      = float(request_json.get("volume", -19))
    format_value      = request_json.get("format", "WAV").upper()
    norm_type_value   = request_json.get("normType", "LUFS").upper()

    fmt = FORMAT_MAP.get(format_value, FORMAT_MAP['WAV'])
    norm_type = NORM_MAP.get(norm_type_value, NORM_MAP['LUFS'])

    audio_bytes = synthesize(
        text_value, voice_value, role_value,
        speed_value, pitch_shift_value, volume_value,
        fmt['container'], norm_type, unsafe_mode_value
    )

    return Response(
        content=audio_bytes,
        media_type=fmt['mime'],
        headers={'Content-Disposition': f'inline; filename="audio.{fmt["ext"]}"'},
    )


def synthesize(text_value, voice_value, role_value, speed_value, pitch_shift_value, volume_value, container_audio_type, norm_type, unsafe_mode_value) -> bytes:
    hints = [
        tts_pb2.Hints(voice=voice_value),
        tts_pb2.Hints(speed=speed_value),
        tts_pb2.Hints(volume=volume_value),
        tts_pb2.Hints(pitch_shift=pitch_shift_value),
    ]
    if role_value and role_value not in ("none", "—"):
        hints.append(tts_pb2.Hints(role=role_value))

    request = tts_pb2.UtteranceSynthesisRequest(
        text=text_value,
        output_audio_spec=tts_pb2.AudioFormatOptions(
            container_audio=tts_pb2.ContainerAudio(
                container_audio_type=container_audio_type
            )
        ),
        hints=hints,
        loudness_normalization_type=norm_type,
        unsafe_mode=unsafe_mode_value
    )

    cred = grpc.ssl_channel_credentials()
    channel = grpc.secure_channel(config['request_api'], cred)
    stub = tts_service_pb2_grpc.SynthesizerStub(channel)

    it = stub.UtteranceSynthesis(
        request,
        metadata=(('authorization', 'Api-Key {}'.format(config['api_key_secret'])),)
    )

    try:
        audio = io.BytesIO()
        for response in it:
            audio.write(response.audio_chunk.data)
        return audio.getvalue()
    except grpc._channel._Rendezvous as err:
        logging.error(f'gRPC error code={err._state.code}, message={err._state.details}')
        raise err
