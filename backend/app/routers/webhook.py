"""
Webhook 回调路由
用于接收飞书自动化流程的回调数据
"""
from fastapi import APIRouter, Request
from pydantic import BaseModel
from typing import Optional, Any, Dict
import logging

from app.services.bitable_webhook_service import bitable_webhook_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/webhook", tags=["webhook"])


class QuestionCallbackRequest(BaseModel):
    """问题查询回调请求"""
    request_id: str
    company: Optional[str] = None
    part1: Optional[str] = None
    part2: Optional[str] = None
    part3: Optional[str] = None
    # 支持嵌套的 data 字段
    data: Optional[Dict[str, Any]] = None


@router.post("/questions/callback")
async def receive_questions_callback(request: Request):
    """
    接收飞书自动化流程的问题查询回调
    
    飞书自动化流程配置：
    1. 触发器：接收到 Webhook 时
    2. 节点1：查找记录（根据公司名称筛选）
    3. 节点2：发送HTTP请求
       - URL: {你的服务器地址}/api/webhook/questions/callback
       - 方法: POST
       - 请求体:
         {
           "request_id": "{{webhook.request_id}}",
           "company": "{{webhook.company}}",
           "part1": "{{查找记录.part1}}",
           "part2": "{{查找记录.part2}}",
           "part3": "{{查找记录.part3}}"
         }
    """
    try:
        # 获取原始请求体
        body = await request.json()
        logger.info(f"收到问题回调: {body}")
        
        # 提取 request_id
        request_id = body.get("request_id")
        if not request_id:
            return {"success": False, "error": "missing request_id"}
        
        # 提取问题数据（可能在顶层或 data 字段中）
        data = body.get("data", body)
        questions_data = {
            "part1": data.get("part1", ""),
            "part2": data.get("part2", ""),
            "part3": data.get("part3", "")
        }
        
        # 传递给服务处理
        success = bitable_webhook_service.receive_callback(request_id, questions_data)
        
        return {"success": success}
        
    except Exception as e:
        logger.error(f"处理问题回调失败: {e}")
        return {"success": False, "error": str(e)}


@router.post("/test")
async def test_webhook(request: Request):
    """
    测试端点，用于验证 Webhook 是否可达
    """
    body = await request.json()
    logger.info(f"收到测试请求: {body}")
    return {
        "success": True,
        "message": "Webhook is working",
        "received": body
    }




