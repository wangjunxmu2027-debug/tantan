"""
状态管理服务 - 管理访谈会话状态
支持Redis和内存存储两种模式
"""
import json
import logging
from typing import Optional, Dict
from datetime import datetime, timedelta

from ..models import InterviewState

logger = logging.getLogger(__name__)


class MemoryStateStore:
    """内存状态存储（开发/测试用）"""
    
    def __init__(self):
        self._store: Dict[str, dict] = {}
    
    async def save(self, session_id: str, state: InterviewState, ttl: int = 86400):
        """保存状态"""
        self._store[session_id] = {
            "data": state.to_dict(),
            "expires_at": datetime.now() + timedelta(seconds=ttl)
        }
    
    async def load(self, session_id: str) -> Optional[InterviewState]:
        """加载状态"""
        entry = self._store.get(session_id)
        if not entry:
            return None
        
        if datetime.now() > entry["expires_at"]:
            del self._store[session_id]
            return None
        
        return InterviewState.from_dict(entry["data"])
    
    async def delete(self, session_id: str):
        """删除状态"""
        if session_id in self._store:
            del self._store[session_id]
    
    async def exists(self, session_id: str) -> bool:
        """检查状态是否存在"""
        return session_id in self._store


class RedisStateStore:
    """Redis状态存储"""
    
    def __init__(self, redis_url: str):
        import redis.asyncio as redis
        self._redis = redis.from_url(redis_url)
        self._prefix = "tantan:session:"
    
    async def save(self, session_id: str, state: InterviewState, ttl: int = 86400):
        """保存状态"""
        key = f"{self._prefix}{session_id}"
        data = json.dumps(state.to_dict(), ensure_ascii=False, default=str)
        await self._redis.setex(key, ttl, data)
    
    async def load(self, session_id: str) -> Optional[InterviewState]:
        """加载状态"""
        key = f"{self._prefix}{session_id}"
        data = await self._redis.get(key)
        
        if not data:
            return None
        
        return InterviewState.from_dict(json.loads(data))
    
    async def delete(self, session_id: str):
        """删除状态"""
        key = f"{self._prefix}{session_id}"
        await self._redis.delete(key)
    
    async def exists(self, session_id: str) -> bool:
        """检查状态是否存在"""
        key = f"{self._prefix}{session_id}"
        return await self._redis.exists(key) > 0


class StateService:
    """状态管理服务"""
    
    def __init__(self, use_redis: bool = False, redis_url: str = None):
        if use_redis and redis_url:
            self._store = RedisStateStore(redis_url)
            logger.info("使用Redis存储会话状态")
        else:
            self._store = MemoryStateStore()
            logger.info("使用内存存储会话状态（仅用于开发）")
    
    async def create_session(self) -> InterviewState:
        """创建新的访谈会话"""
        state = InterviewState()
        await self._store.save(state.session_id, state)
        logger.info(f"创建新会话: {state.session_id}")
        return state
    
    async def get_session(self, session_id: str) -> Optional[InterviewState]:
        """获取会话状态"""
        state = await self._store.load(session_id)
        if not state:
            logger.warning(f"会话不存在: {session_id}")
        return state
    
    async def update_session(self, state: InterviewState):
        """更新会话状态"""
        state.updated_at = datetime.now()
        await self._store.save(state.session_id, state)
    
    async def delete_session(self, session_id: str):
        """删除会话"""
        await self._store.delete(session_id)
        logger.info(f"删除会话: {session_id}")
    
    async def session_exists(self, session_id: str) -> bool:
        """检查会话是否存在"""
        return await self._store.exists(session_id)


# 根据配置创建服务实例
def create_state_service() -> StateService:
    """创建状态服务实例"""
    from config import settings
    
    use_redis = bool(settings.REDIS_HOST and settings.REDIS_PORT)
    redis_url = None
    
    if use_redis:
        if settings.REDIS_PASSWORD:
            redis_url = f"redis://:{settings.REDIS_PASSWORD}@{settings.REDIS_HOST}:{settings.REDIS_PORT}/{settings.REDIS_DB}"
        else:
            redis_url = f"redis://{settings.REDIS_HOST}:{settings.REDIS_PORT}/{settings.REDIS_DB}"
    
    return StateService(use_redis=use_redis, redis_url=redis_url)


# 延迟初始化的全局单例
_state_service: Optional[StateService] = None


def get_state_service() -> StateService:
    """获取状态服务单例"""
    global _state_service
    if _state_service is None:
        _state_service = create_state_service()
    return _state_service




