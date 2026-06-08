# SpeechKit Web UI

Демонстрационное веб-приложение для работы с [Yandex SpeechKit](https://aistudio.yandex.ru/ru/ai-speech) через браузер. Позволяет на практике познакомиться с возможностями синтеза и распознавания речи и поэкспериментировать с параметрами запросов.

Приложение состоит из трёх вкладок, каждая из которых демонстрирует отдельный сценарий работы со SpeechKit API v3.

## Возможности

### 🔊 Синтез речи (TTS)

Озвучивание произвольного текста через [TTS API v3](https://yandex.cloud/ru-kz/docs/speechkit/tts-v3/api-ref/grpc/).

- Выбор из 19 русскоязычных голосов и голосов на `en-US`, `kk-KZ`, `uz-UZ`, `de-DE`, `he-IL`, со сменой амплуа (нейтральное, доброе, злое и т.д.) для голосов, которые их поддерживают.
- Настройка скорости, тона (`pitch shift`), громкости и формата вывода (WAV / OGG / MP3).
- Поддержка [TTS-разметки](https://aistudio.yandex.ru/docs/ru/speechkit/tts/markup/tts-markup.html) и готовые примеры текстов для быстрого старта.
- Тексты длиннее 249 символов автоматически синтезируются в unsafe-режиме.
- Прослушивание результата прямо в браузере и скачивание аудиофайла.

### 📝 Распознавание речи (STT, async)

Асинхронная расшифровка загруженного аудиофайла (до 4 часов / 1 ГБ) через [STT API v3](https://yandex.cloud/ru-kz/docs/speechkit/stt-v3/api-ref/grpc/).

- Выбор языка распознавания (включая авто-определение) и частоты дискретизации.
- [Speaker Labeling](https://aistudio.yandex.ru/docs/ru/speechkit/stt/speaker-labeling.html) — разметка реплик по дикторам (моно, до 2 дикторов).
- [Классификаторы](https://aistudio.yandex.ru/docs/ru/speechkit/stt/analysis.html) — анализ содержания разговора (приветствие, прощание, пол говорящего и др.; только для `ru-RU`).
- [LLM-суммаризация](https://aistudio.yandex.ru/docs/ru/speechkit/stt/llm-results.html) — пересказ расшифровки с произвольной инструкцией и выбором модели YandexGPT.
- Статистика диалога: длительность речи, паузы, темп, перебивания.
- Опции нормализации текста: расстановка пунктуации, фильтр ненормативной лексики, форматирование чисел.

### 🎙️ Потоковое распознавание (STT, streaming)

Распознавание с микрофона в реальном времени через WebSocket и [потоковый STT API](https://aistudio.yandex.ru/docs/ru/speechkit/stt/streaming.html) (до 5 минут / 10 МБ на сессию).

- Промежуточные и финальные гипотезы по мере поступления речи (LINEAR16_PCM, 16 кГц, моно).
- Настройка паузы окончания фразы (EOU) и нормализации текста.
- Классификаторы и LLM-обработка итогового результата (классификаторы — только для `ru-RU`).
- Таймер сессии с авто-стопом и предупреждением за 30 секунд до лимита.

В каждой вкладке отображается реальный gRPC-запрос и ответ — удобно, чтобы изучить структуру вызовов API.

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
