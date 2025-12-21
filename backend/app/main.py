"""
AI调研助手-探探 后端主入口
"""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from .routers import interview_router
from .routers.webhook import router as webhook_router

# 配置日志
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时
    logger.info(f"🚀 {settings.APP_NAME} 启动中...")
    logger.info(f"📍 API地址: http://{settings.API_HOST}:{settings.API_PORT}")
    logger.info(f"🤖 LLM模型: {settings.LLM_MODEL}")
    logger.info(f"📊 多维表格: {settings.BITABLE_APP_TOKEN or '未配置'}")
    
    yield
    
    # 关闭时
    logger.info(f"👋 {settings.APP_NAME} 已关闭")


# 创建FastAPI应用
app = FastAPI(
    title=settings.APP_NAME,
    description="AI调研助手-探探 API服务",
    version="1.0.0",
    lifespan=lifespan
)

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(interview_router, prefix="/api")
app.include_router(webhook_router)  # Webhook 回调路由


@app.get("/")
async def root():
    """根路径"""
    return {
        "name": settings.APP_NAME,
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/health")
async def health_check():
    """健康检查"""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=settings.DEBUG
    )

