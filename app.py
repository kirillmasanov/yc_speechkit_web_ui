import os
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI

load_dotenv()
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

@app.get("/api/health")
async def health():
    return {"status": "ok"}

app.mount("/", StaticFiles(directory="frontend", html=True), name="static")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
