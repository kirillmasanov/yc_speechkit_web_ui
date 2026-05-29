import grpc
import logging
import os

import httpx
from google.protobuf.json_format import MessageToDict

from fastapi import APIRouter, File, Form, Query, UploadFile
from fastapi.responses import JSONResponse

import yandex.cloud.ai.stt.v3.stt_pb2 as stt_pb2
import yandex.cloud.ai.stt.v3.stt_service_pb2 as stt_service_pb2
import yandex.cloud.ai.stt.v3.stt_service_pb2_grpc as stt_service_pb2_grpc

logging.getLogger().setLevel(logging.INFO)

_folder_id = os.environ.get('YANDEX_FOLDER_ID', '')
config = {
    'api_key_secret' : os.environ['YANDEX_API_KEY'],
    'model_uri'      : os.environ.get('MODEL_URI', f'gpt://{_folder_id}/yandexgpt-5.1' if _folder_id else ''),
}

STT_GRPC_ENDPOINT = "stt.api.cloud.yandex.net:443"
url_operations_api = "https://operation.api.cloud.yandex.net/operations/"
request_header = {'Authorization': 'Api-Key {}'.format(config['api_key_secret'])}

router = APIRouter()


@router.get("/models")
async def list_models():
    if not _folder_id:
        return JSONResponse({"error": "YANDEX_FOLDER_ID not configured"}, status_code=500)
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                'https://ai.api.cloud.yandex.net/v1/models',
                headers={
                    'Authorization': f'Api-Key {config["api_key_secret"]}',
                    'x-project': _folder_id,
                },
                timeout=10.0,
            )
            resp.raise_for_status()
            return JSONResponse(resp.json())
    except Exception as e:
        logging.error(f"Failed to fetch models: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)


@router.post("/stt")
async def upload_file(
    file: UploadFile = File(...),
    lang: str = Form(default='auto'),
    rate: int = Form(default=48000),
    summaryInstruction: str = Form(default=''),
    speakerLabeling: bool = Form(default=False),
    llmModel: str = Form(default=''),
    classifiers: str = Form(default=''),
):
    audio_bytes = await file.read()
    filename = file.filename.lower()

    if filename.endswith(".mp3"):
        container_type = stt_pb2.ContainerAudio.MP3
    elif filename.endswith(".ogg"):
        container_type = stt_pb2.ContainerAudio.OGG_OPUS
    elif filename.endswith(".wav"):
        container_type = stt_pb2.ContainerAudio.WAV
    else:
        return JSONResponse({"error": "Unsupported file type"}, status_code=400)

    operation_id = create_recognition_task(
        audio_bytes, container_type, lang, rate, summaryInstruction, speakerLabeling, llmModel, classifiers
    )

    if not operation_id:
        return JSONResponse({"error": "Failed to create recognition task"}, status_code=500)

    return JSONResponse({"message": "Operation created successfully", "operation": operation_id})


@router.get("/operation")
async def operation_status(operationId: str = Query(default=None)):
    if not operationId:
        return JSONResponse({"error": "Missing operation parameter"}, status_code=400)

    is_done = await check_operation_status(operationId)

    if not is_done.get('done', False):
        logging.info("Operation in progress: {}".format(operationId))
        return JSONResponse({"message": "Operation in progress", "operation": operationId, "done": "false"})

    results, speaker_analysis_list, conversation_analysis_data, summarization_data, classifier_data = get_recognition_results(operationId)

    return JSONResponse({
        "message": "Operation is complete",
        "operation": operationId,
        "done": "true",
        "result": {
            "chunks": results,
            "speakerAnalysis": speaker_analysis_list,
            "conversationAnalysis": conversation_analysis_data,
            "summarization": summarization_data,
            "classifierData": classifier_data,
        },
    })


async def check_operation_status(operation_id):
    try:
        async with httpx.AsyncClient() as client:
            result = await client.get(url_operations_api + operation_id, headers=request_header)
            result.raise_for_status()
    except httpx.HTTPStatusError as e:
        logging.error("Operation status check failed: {}".format(e))
        return {}
    except httpx.RequestError as e:
        logging.error("Operation status check failed: {}".format(e))
        return {}
    return result.json()


def _create_grpc_channel():
    cred = grpc.ssl_channel_credentials()
    channel = grpc.secure_channel(STT_GRPC_ENDPOINT, cred)
    metadata = [('authorization', 'Api-Key {}'.format(config['api_key_secret']))]
    return channel, metadata


_ALL_CLASSIFIERS = [
    'formal_greeting', 'informal_greeting',
    'formal_farewell', 'informal_farewell',
    'insult', 'profanity', 'gender', 'negative', 'answerphone',
]


def create_recognition_task(audio_bytes, container_type, lang, rate=48000, summary_instruction='', speaker_labeling=False, model_uri_override='', classifiers=''):
    channel, metadata = _create_grpc_channel()
    stub = stt_service_pb2_grpc.AsyncRecognizerStub(channel)

    language_restriction = None
    if lang and lang != 'auto':
        language_restriction = stt_pb2.LanguageRestrictionOptions(
            restriction_type=stt_pb2.LanguageRestrictionOptions.WHITELIST,
            language_code=[lang]
        )

    recognition_model = stt_pb2.RecognitionModelOptions(
        model='general',
        audio_format=stt_pb2.AudioFormatOptions(
            container_audio=stt_pb2.ContainerAudio(container_audio_type=container_type)
        ),
        text_normalization=stt_pb2.TextNormalizationOptions(
            text_normalization=stt_pb2.TextNormalizationOptions.TEXT_NORMALIZATION_ENABLED,
            literature_text=True
        ),
        audio_processing_type=stt_pb2.RecognitionModelOptions.FULL_DATA,
    )

    if language_restriction:
        recognition_model.language_restriction.CopyFrom(language_restriction)

    recognize_request = stt_pb2.RecognizeFileRequest(
        content=audio_bytes,
        recognition_model=recognition_model,
        speech_analysis=stt_pb2.SpeechAnalysisOptions(
            enable_speaker_analysis=True,
            enable_conversation_analysis=True,
        ),
    )

    if speaker_labeling:
        recognize_request.speaker_labeling.CopyFrom(stt_pb2.SpeakerLabelingOptions(
            speaker_labeling=stt_pb2.SpeakerLabelingOptions.SPEAKER_LABELING_ENABLED,
        ))

    if classifiers:
        requested = _ALL_CLASSIFIERS if classifiers == 'all' else [
            c.strip() for c in classifiers.split(',') if c.strip() in _ALL_CLASSIFIERS
        ]
        if requested:
            recognize_request.recognition_classifier.CopyFrom(
                stt_pb2.RecognitionClassifierOptions(
                    classifiers=[
                        stt_pb2.RecognitionClassifier(
                            classifier=name,
                            triggers=[stt_pb2.RecognitionClassifier.ON_FINAL],
                        )
                        for name in requested
                    ]
                )
            )

    effective_model_uri = model_uri_override or config['model_uri']
    if effective_model_uri and summary_instruction:
        recognize_request.summarization.CopyFrom(stt_pb2.SummarizationOptions(
            model_uri=effective_model_uri,
            properties=[stt_pb2.SummarizationProperty(instruction=summary_instruction)]
        ))

    try:
        logging.info("Sending RecognizeFile request via gRPC v3")
        operation = stub.RecognizeFile(recognize_request, metadata=metadata)
        logging.info("Operation created: {}".format(operation.id))
        return operation.id
    except grpc.RpcError as e:
        logging.error(f"gRPC RecognizeFile failed: code={e.code()}, details={e.details()}")
        return None


def get_recognition_results(operation_id):
    channel, metadata = _create_grpc_channel()
    stub = stt_service_pb2_grpc.AsyncRecognizerStub(channel)

    results = []
    speaker_analysis_list = []
    conversation_analysis_data = None
    summarization_data = None
    classifier_data = []

    try:
        logging.info("Fetching recognition results for operation: {}".format(operation_id))
        for response_msg in stub.GetRecognition(
            stt_service_pb2.GetRecognitionRequest(operation_id=operation_id),
            metadata=metadata
        ):
            chunk = MessageToDict(response_msg, preserving_proto_field_name=True)
            channel_tag = chunk.get('channel_tag', '')

            if 'final_refinement' in chunk:
                refinement = chunk['final_refinement']
                if 'normalized_text' in refinement:
                    alternatives = refinement['normalized_text'].get('alternatives', [])
                    entry = {
                        'channelTag': channel_tag,
                        'alternatives': [{
                            'text': alt.get('text', ''),
                            'words': alt.get('words', []),
                            'confidence': alt.get('confidence', 0),
                            'languages': alt.get('languages', []),
                            'startTimeMs': alt.get('start_time_ms', 0),
                            'endTimeMs': alt.get('end_time_ms', 0),
                        } for alt in alternatives]
                    }
                    if entry:
                        results.append(entry)

            if 'speaker_analysis' in chunk:
                sa = chunk['speaker_analysis']
                if sa.get('window_type') == 'TOTAL':
                    speaker_analysis_list.append(sa)

            if 'conversation_analysis' in chunk:
                conversation_analysis_data = chunk['conversation_analysis']

            if 'summarization' in chunk:
                summarization_data = chunk['summarization']

            if 'classifier_update' in chunk:
                cu = chunk['classifier_update']
                cr = cu.get('classifier_result', {})
                classifier_data.append({
                    'classifier': cr.get('classifier', ''),
                    'labels': cr.get('labels', []),
                    'startTimeMs': cu.get('start_time_ms', 0),
                    'endTimeMs': cu.get('end_time_ms', 0),
                })

    except grpc.RpcError as e:
        logging.error(f"gRPC GetRecognition failed: code={e.code()}, details={e.details()}")

    return results, speaker_analysis_list, conversation_analysis_data, summarization_data, classifier_data
