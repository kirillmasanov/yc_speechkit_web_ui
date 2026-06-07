import grpc.aio
import json
import logging
import os

from google.protobuf.json_format import MessageToDict
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

import yandex.cloud.ai.stt.v3.stt_pb2 as stt_pb2
import yandex.cloud.ai.stt.v3.stt_service_pb2_grpc as stt_service_pb2_grpc

logging.getLogger().setLevel(logging.INFO)

_folder_id = os.environ.get('YANDEX_FOLDER_ID', '')
config = {
    'api_key_secret': os.environ['YANDEX_API_KEY'],
    'model_uri': os.environ.get('MODEL_URI', f'gpt://{_folder_id}/yandexgpt-5.1' if _folder_id else ''),
}

STT_GRPC_ENDPOINT = "stt.api.cloud.yandex.net:443"

router = APIRouter()


@router.websocket('/stream')
async def stream_recognize(
    websocket: WebSocket,
    lang: str = Query(default='ru-RU'),
    summaryInstruction: str = Query(default=''),
    classifiers: str = Query(default=''),
    eouPause: str = Query(default=''),
    normalization: str = Query(default='true'),
    profanityFilter: str = Query(default='false'),
    literaryText: str = Query(default='false'),
):
    await websocket.accept()
    logging.info("WebSocket connection established")
    logging.info(f"Language: {lang}, summaryInstruction: {bool(summaryInstruction)}, classifiers: {classifiers}, eouPause: {eouPause}")

    # Query params arrive as strings — treat the usual truthy spellings as True.
    def _is_true(value: str) -> bool:
        return value.lower() in ('1', 'true', 'yes', 'on')

    norm_enabled = _is_true(normalization)
    profanity_filter = _is_true(profanityFilter)
    literary_text = _is_true(literaryText)

    channel = None

    try:
        cred = grpc.ssl_channel_credentials()
        channel = grpc.aio.secure_channel(STT_GRPC_ENDPOINT, cred)
        stub = stt_service_pb2_grpc.RecognizerStub(channel)

        async def audio_generator():
            recognition_model = stt_pb2.RecognitionModelOptions(
                audio_format=stt_pb2.AudioFormatOptions(
                    raw_audio=stt_pb2.RawAudio(
                        audio_encoding=stt_pb2.RawAudio.LINEAR16_PCM,
                        sample_rate_hertz=16000,
                        audio_channel_count=1
                    )
                ),
                text_normalization=stt_pb2.TextNormalizationOptions(
                    text_normalization=(
                        stt_pb2.TextNormalizationOptions.TEXT_NORMALIZATION_ENABLED
                        if norm_enabled
                        else stt_pb2.TextNormalizationOptions.TEXT_NORMALIZATION_DISABLED
                    ),
                    profanity_filter=profanity_filter,
                    literature_text=literary_text
                ),
                language_restriction=stt_pb2.LanguageRestrictionOptions(
                    restriction_type=stt_pb2.LanguageRestrictionOptions.WHITELIST,
                    language_code=[lang]
                ),
                audio_processing_type=stt_pb2.RecognitionModelOptions.REAL_TIME
            )

            session_kwargs = {'recognition_model': recognition_model}

            if summaryInstruction and config['model_uri']:
                session_kwargs['summarization'] = stt_pb2.SummarizationOptions(
                    model_uri=config['model_uri'],
                    properties=[stt_pb2.SummarizationProperty(instruction=summaryInstruction)]
                )
                logging.info("Summarization enabled for this session")

            # Классификаторы поддерживаются только для ru-RU (см. документацию analysis).
            if classifiers and lang == 'ru-RU':
                all_classifiers = [
                    'formal_greeting', 'informal_greeting',
                    'formal_farewell', 'informal_farewell',
                    'insult', 'profanity', 'gender', 'negative', 'answerphone'
                ]
                requested = all_classifiers if classifiers == 'all' else [
                    c.strip() for c in classifiers.split(',') if c.strip() in all_classifiers
                ]
                if requested:
                    session_kwargs['recognition_classifier'] = stt_pb2.RecognitionClassifierOptions(
                        classifiers=[
                            stt_pb2.RecognitionClassifier(
                                classifier=name,
                                triggers=[stt_pb2.RecognitionClassifier.ON_UTTERANCE]
                            )
                            for name in requested
                        ]
                    )
                    logging.info(f"Classifiers enabled: {requested}")

            if eouPause:
                try:
                    pause_ms = int(eouPause)
                    if 100 <= pause_ms <= 3000:
                        session_kwargs['eou_classifier'] = stt_pb2.EouClassifierOptions(
                            default_classifier=stt_pb2.DefaultEouClassifier(
                                type=stt_pb2.DefaultEouClassifier.DEFAULT,
                                max_pause_between_words_hint_ms=pause_ms
                            )
                        )
                        logging.info(f"EOU pause set to {pause_ms}ms")
                except ValueError:
                    logging.warning(f"Invalid eouPause value: {eouPause}")

            streaming_options = stt_pb2.StreamingOptions(**session_kwargs)

            # Отправляем клиенту превью реального gRPC-запроса (для лога событий).
            try:
                await websocket.send_text(json.dumps({
                    'type': 'session',
                    'request': {
                        'endpoint': STT_GRPC_ENDPOINT,
                        'method': 'Recognizer.RecognizeStreaming (gRPC STT v3, первое сообщение)',
                        'session_options': MessageToDict(streaming_options, preserving_proto_field_name=True),
                    },
                }))
            except Exception as e:
                logging.warning(f"Failed to send session preview: {e}")

            yield stt_pb2.StreamingRequest(session_options=streaming_options)

            try:
                while True:
                    message = await websocket.receive()
                    if message["type"] == "websocket.disconnect":
                        break
                    if "text" in message:
                        if message["text"] == 'END':
                            logging.info("Received END signal")
                            break
                    elif "bytes" in message and message["bytes"]:
                        yield stt_pb2.StreamingRequest(chunk=stt_pb2.AudioChunk(data=message["bytes"]))
            except Exception as e:
                logging.error(f"Error in audio_generator: {e}")

        call = stub.RecognizeStreaming(
            audio_generator(),
            metadata=(('authorization', f'Api-Key {config["api_key_secret"]}'),)
        )

        async for response in call:
            try:
                event_type = response.WhichOneof('Event')
                result = {'type': event_type, 'alternatives': []}

                if event_type == 'partial' and len(response.partial.alternatives) > 0:
                    result['alternatives'] = [a.text for a in response.partial.alternatives]
                elif event_type == 'final':
                    result['alternatives'] = [a.text for a in response.final.alternatives]
                elif event_type == 'final_refinement':
                    result['alternatives'] = [a.text for a in response.final_refinement.normalized_text.alternatives]
                elif event_type == 'eou_update':
                    result['eou_update'] = True
                elif event_type == 'status_code':
                    result['status_code'] = response.status_code.code_type
                elif event_type == 'classifier_update':
                    cr = response.classifier_update.classifier_result
                    result['classifier_update'] = {
                        'classifier': cr.classifier if hasattr(cr, 'classifier') else '',
                        'labels': [
                            {'label': l.label, 'confidence': l.confidence}
                            for l in (cr.labels if hasattr(cr, 'labels') else [])
                        ],
                        'highlights': [
                            {'text': h.text, 'start_time_ms': h.start_time_ms, 'end_time_ms': h.end_time_ms}
                            for h in (cr.highlights if hasattr(cr, 'highlights') else [])
                        ],
                    }
                    logging.info(f"Classifier update: {cr.classifier}")
                elif event_type == 'summarization':
                    s = response.summarization
                    result['summarization'] = {
                        'results': [{'response': item.response} for item in (s.results if hasattr(s, 'results') else [])],
                    }
                    if hasattr(s, 'content_usage'):
                        cu = s.content_usage
                        result['summarization']['content_usage'] = {
                            'input_text_tokens': cu.input_text_tokens,
                            'completion_tokens': cu.completion_tokens,
                            'total_tokens': cu.total_tokens,
                        }
                    logging.info("Summarization result received")

                await websocket.send_text(json.dumps(result))

            except Exception as e:
                logging.error(f"Error processing response: {e}")

    except grpc.aio.AioRpcError as e:
        logging.error(f"gRPC error: code={e.code()}, details={e.details()}")
        try:
            await websocket.send_text(json.dumps({'type': 'error', 'message': f'Recognition error: {e.details()}'}))
        except Exception:
            pass
    except WebSocketDisconnect:
        logging.info("WebSocket disconnected by client")
    except Exception as e:
        logging.error(f"WebSocket error: {e}")
        try:
            await websocket.send_text(json.dumps({'type': 'error', 'message': str(e)}))
        except Exception:
            pass
    finally:
        if channel:
            await channel.close()
        logging.info("WebSocket connection closed")
