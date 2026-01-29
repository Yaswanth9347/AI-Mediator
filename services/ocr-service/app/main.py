from fastapi import FastAPI, HTTPException
from contextlib import asynccontextmanager
import structlog
from app.core.config import settings
from app.core.logging_config import setup_logging

logger = structlog.get_logger()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    setup_logging()
    logger.info("Startup complete", project=settings.PROJECT_NAME)
    yield
    # Shutdown
    logger.info("Shutdown complete")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    lifespan=lifespan,
    docs_url=f"{settings.API_V1_STR}/docs",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
)

# Add CORS Middleware
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# Register Exception Handlers
from fastapi.exceptions import RequestValidationError
from app.core.exceptions import (
    global_exception_handler, 
    http_exception_handler, 
    document_processing_exception_handler,
    DocumentProcessingError
)

app.add_exception_handler(Exception, global_exception_handler)
app.add_exception_handler(HTTPException, http_exception_handler)
app.add_exception_handler(DocumentProcessingError, document_processing_exception_handler)

# Include Routes
from app.api.routes import document
app.include_router(document.router, prefix="/api/v1/document", tags=["Document"])

@app.get("/health", tags=["Health"])
async def health_check():
    return {
        "status": "active",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION
    }

from fastapi.responses import HTMLResponse, JSONResponse
import os

@app.get("/", response_class=HTMLResponse, tags=["UI"])
async def root():
    # Read the HTML file directly to avoid needing extra template engine dependencies
    file_path = os.path.join(os.path.dirname(__file__), "templates", "index.html")
    with open(file_path, "r") as f:
        return f.read()

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return JSONResponse(content={}, status_code=204)
