"""
配置文件 - 存放所有环境变量和配置项
"""
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """应用配置"""
    
    # 应用设置
    APP_NAME: str = "AI调研助手-探探"
    DEBUG: bool = True
    
    # API服务配置
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    
    # LLM API 配置 (中转API)
    LLM_API_BASE_URL: str = "https://api.openai.com/v1"  # 替换为您的中转API地址
    LLM_API_KEY: str = "your-api-key"  # 替换为您的API密钥
    LLM_MODEL: str = "gpt-4o"  # 或其他模型
    
    # 飞书配置
    FEISHU_APP_ID: str = ""
    FEISHU_APP_SECRET: str = ""
    
    # 多维表格配置 (方式1: 飞书应用API，需要创建应用)
    BITABLE_APP_TOKEN: str = ""  # 多维表格的app_token
    BITABLE_QUESTIONS_TABLE_ID: str = ""  # 调研问题表ID
    BITABLE_RECORDS_TABLE_ID: str = ""  # 会话记录表ID
    
    # 多维表格配置 (方式2: Webhook自动化流程，更简单！)
    WEBHOOK_QUESTIONS_URL: str = ""  # 查询问题的Webhook地址
    WEBHOOK_RECORDS_URL: str = ""    # 保存记录的Webhook地址
    WEBHOOK_CALLBACK_URL: str = ""   # 回调地址（可选）
    
    # 选择使用哪种方式与多维表格交互
    USE_WEBHOOK: bool = True  # True=使用Webhook, False=使用飞书应用API
    
    # Redis配置 (用于存储会话状态，留空则使用内存存储)
    REDIS_HOST: str = ""  # 留空使用内存存储
    REDIS_PORT: int = 0
    REDIS_PASSWORD: Optional[str] = None
    REDIS_DB: int = 0
    
    # 语音转文字配置 (可选)
    ASR_PROVIDER: str = "web"  # "web" | "whisper" | "xunfei"
    WHISPER_API_KEY: Optional[str] = None
    
    # CORS配置
    CORS_ORIGINS: list = ["http://localhost:3000", "http://127.0.0.1:3000"]
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()

