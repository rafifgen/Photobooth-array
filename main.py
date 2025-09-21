# main.py
import base64
import uuid
import os
import time
import schedule
import threading
from datetime import datetime, timedelta

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import aiofiles

UPLOAD_DIR = "uploads"
STATIC_DIR = "static"
MAX_IMAGE_AGE_DAYS = 7 

app = FastAPI()
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(STATIC_DIR, exist_ok=True)

# CORS middleware tetap penting
origins = ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Menyajikan folder 'uploads' dan 'static'
app.mount(f"/{UPLOAD_DIR}", StaticFiles(directory=UPLOAD_DIR), name=UPLOAD_DIR)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


class ImagePayload(BaseModel):
    image_data: str

# Endpoint utama untuk menyajikan halaman web
@app.get("/")
async def read_index():
    return FileResponse(os.path.join(STATIC_DIR, 'index.html'))

# Endpoint tunggal untuk menerima gambar yang sudah jadi
@app.post("/upload")
async def upload_image(payload: ImagePayload, request: Request):
    try:
        header, data = payload.image_data.split(",", 1)
        image_bytes = base64.b64decode(data)
        filename = f"{uuid.uuid4()}.png"
        file_path = os.path.join(UPLOAD_DIR, filename)
        
        async with aiofiles.open(file_path, "wb") as f:
            await f.write(image_bytes)
            
        file_url = f"{request.base_url}{UPLOAD_DIR}/{filename}"
        return {"url": file_url, "filename": filename}
        
    except Exception as e:
        return {"error": str(e), "status": "failed"}

# --- Logika Cleanup (tetap sama untuk mengelola penyimpanan) ---
def cleanup_old_images():
    print(f"[{datetime.now()}] Running cleanup job...")
    cutoff_time = datetime.now() - timedelta(days=MAX_IMAGE_AGE_DAYS)
    for filename in os.listdir(UPLOAD_DIR):
        file_path = os.path.join(UPLOAD_DIR, filename)
        if os.path.isfile(file_path):
            try:
                file_modified_time = datetime.fromtimestamp(os.path.getmtime(file_path))
                if file_modified_time < cutoff_time:
                    os.remove(file_path)
                    print(f"Deleted old file: {filename}")
            except Exception as e:
                print(f"Error processing file {filename}: {e}")
    print("Cleanup job finished.")

def run_scheduler():
    schedule.every().day.at("03:00").do(cleanup_old_images)
    while True:
        schedule.run_pending()
        time.sleep(60)

@app.on_event("startup")
async def startup_event():
    print("Starting background scheduler for cleanup.")
    scheduler_thread = threading.Thread(target=run_scheduler)
    scheduler_thread.daemon = True
    scheduler_thread.start()

