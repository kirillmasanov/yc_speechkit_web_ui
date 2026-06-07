# SpeechKit Web UI

Демонстрационное веб-приложение для работы с [Yandex SpeechKit](https://aistudio.yandex.ru/ru/ai-speech) через браузер. Позволяет на практике познакомиться с возможностями синтеза и распознавания речи и поэкспериментировать с параметрами запросов.

Приложение состоит из трёх вкладок:

- **Синтез речи (TTS)** — озвучивание текста разными голосами и амплуа, с настройкой скорости, тона, громкости и формата; поддержка [TTS-разметки](https://aistudio.yandex.ru/docs/ru/speechkit/tts/markup/tts-markup.html).
- **Распознавание речи (STT, async)** — асинхронная расшифровка загруженного аудиофайла с [Speaker Labeling](https://aistudio.yandex.ru/docs/ru/speechkit/stt/speaker-labeling.html), [классификаторами](https://aistudio.yandex.ru/docs/ru/speechkit/stt/analysis.html), [LLM-суммаризацией](https://aistudio.yandex.ru/docs/ru/speechkit/stt/llm-results.html) и статистикой диалога (длительность речи, паузы, скорость, перебивания).
- **Потоковое распознавание (STT, streaming)** — распознавание с микрофона в реальном времени через WebSocket, с нормализацией, классификаторами и LLM-обработкой результата.

## Быстрый старт

Понадобятся [API-ключ](https://yandex.cloud/ru/docs/iam/concepts/authorization/api-key) сервисного аккаунта Yandex Cloud и идентификатор каталога (`folder_id`).

### Локальный запуск (dev)

```bash
cp .env.example .env          # заполнить YANDEX_API_KEY и YANDEX_FOLDER_ID
uv sync
uv run uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

### Docker Compose

```bash
cp .env.example .env          # заполнить YANDEX_API_KEY и YANDEX_FOLDER_ID
docker compose up --build
```

После запуска приложение доступно по адресу `http://localhost:8000`.

> Потоковое распознавание через микрофон работает только при локальном развёртывании, так как требует поддержки WebSocket, недоступной в Serverless Containers.

## Переменные окружения

| Переменная | Обязательна | Описание |
|---|---|---|
| `YANDEX_API_KEY` | да | API-ключ Yandex Cloud (используется для TTS, STT и потокового распознавания). |
| `YANDEX_FOLDER_ID` | да | Идентификатор каталога; на его основе строится дефолтный URI модели YandexGPT. |
| `MODEL_URI` | нет | Явный URI модели YandexGPT для суммаризации. По умолчанию `gpt://<YANDEX_FOLDER_ID>/yandexgpt-5.1`. |

## Связанные примеры

- [Автоматическое батч-распознавание аудио](https://github.com/yandex-cloud-examples/yc-speechkit-async-recognizer)
- [Пример стриминг распознавания](https://github.com/yandex-cloud-examples/yc-speechkit-streams-recognizer)
