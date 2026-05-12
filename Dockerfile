FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

COPY pyproject.toml .
RUN uv sync --no-dev --no-install-project

COPY services/ ./services/
COPY frontend/ ./frontend/
COPY app.py .

RUN python3 -c "
content = open('frontend/script.js.tpl').read()
content = content.replace('\${api_gw}', '').replace('\${stream_enabled}', 'true')
open('frontend/script.js', 'w').write(content)
" && rm frontend/script.js.tpl

EXPOSE 8080

CMD [".venv/bin/python", "app.py"]
