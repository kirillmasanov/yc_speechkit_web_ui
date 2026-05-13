FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

COPY pyproject.toml .
RUN uv sync --no-dev --no-install-project

COPY services/ ./services/
COPY frontend/ ./frontend/
COPY app.py .

EXPOSE 8080

CMD [".venv/bin/python", "app.py"]
