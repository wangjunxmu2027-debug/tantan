"""
访谈API路由
"""
import logging
from fastapi import APIRouter, HTTPException, UploadFile, File
from typing import Optional

from ..models import (
    CreateSessionResponse,
    SendMessageRequest,
    SendMessageResponse,
    InterviewSummaryResponse
)
from ..services.interview_controller import interview_controller

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/interview", tags=["interview"])


@router.post("/create", response_model=CreateSessionResponse)
async def create_session():
    """创建新的访谈会话"""
    try:
        session_id, welcome_message = await interview_controller.create_session()
        
        return CreateSessionResponse(
            session_id=session_id,
            welcome_message=welcome_message,
            stage="collect"
        )
    except Exception as e:
        logger.error(f"创建会话失败: {e}")
        raise HTTPException(status_code=500, detail="创建会话失败")


@router.post("/message", response_model=SendMessageResponse)
async def send_message(request: SendMessageRequest):
    """发送消息"""
    try:
        reply, state = await interview_controller.process_message(
            session_id=request.session_id,
            user_message=request.content
        )
        
        return SendMessageResponse(
            reply=reply,
            stage=state.stage.value,
            progress={
                "current_part": state.progress.current_part,
                "current_question_index": state.progress.current_question_index,
                "total_parts": state.progress.total_parts
            },
            is_completed=(state.stage.value == "completed")
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"处理消息失败: {e}")
        raise HTTPException(status_code=500, detail="处理消息失败")


@router.post("/voice")
async def upload_voice(
    session_id: str,
    file: UploadFile = File(...)
):
    """上传语音并转换为文字
    
    TODO: 实现语音转文字功能
    目前使用Web Speech API在前端处理
    """
    try:
        # 读取音频文件
        audio_content = await file.read()
        
        # TODO: 调用ASR服务进行语音转文字
        # transcription = await asr_service.transcribe(audio_content)
        
        # 目前返回占位响应
        return {
            "success": False,
            "message": "后端语音转文字功能开发中，请使用前端语音输入"
        }
        
    except Exception as e:
        logger.error(f"语音处理失败: {e}")
        raise HTTPException(status_code=500, detail="语音处理失败")


@router.get("/{session_id}/summary", response_model=InterviewSummaryResponse)
async def get_summary(session_id: str):
    """获取访谈总结"""
    try:
        result = await interview_controller.get_summary(session_id)
        
        return InterviewSummaryResponse(
            summary=result.get("summary", ""),
            answers=result.get("answers", []),
            user_info=result.get("user_info", {})
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"获取总结失败: {e}")
        raise HTTPException(status_code=500, detail="获取总结失败")


@router.get("/{session_id}/status")
async def get_session_status(session_id: str):
    """获取会话状态"""
    try:
        from ..services.state_service import get_state_service
        state_service = get_state_service()
        
        state = await state_service.get_session(session_id)
        if not state:
            raise HTTPException(status_code=404, detail="会话不存在")
        
        return {
            "session_id": session_id,
            "stage": state.stage.value,
            "progress": state.progress.model_dump(),
            "user": state.user.model_dump(),
            "message_count": len(state.history),
            "answer_count": len(state.answers),
            "token_count": state.token_count,
            "created_at": state.created_at.isoformat(),
            "updated_at": state.updated_at.isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取状态失败: {e}")
        raise HTTPException(status_code=500, detail="获取状态失败")

