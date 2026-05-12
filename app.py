import os
from pathlib import Path
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI

load_dotenv()

# Generate script.js from template for local development (Docker does this at build time)
_tpl = Path("frontend/script.js.tpl")
_js = Path("frontend/script.js")
if _tpl.exists() and not _js.exists():
    _js.write_text(
        _tpl.read_text()
        .replace("${api_gw}", "")
        .replace("${stream_enabled}", "true")
    )
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from services.tts.main import router as tts_router
from services.stt.main import router as stt_router
from services.stream.main import router as stream_router

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["ETag"],
)

app.include_router(tts_router)
app.include_router(stt_router)
app.include_router(stream_router)

app.mount("/", StaticFiles(directory="frontend", html=True), name="static")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))
