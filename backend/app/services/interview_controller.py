"""
访谈控制器 - 状态机逻辑
处理访谈的各个阶段流转
"""
import json
import logging
from typing import Tuple
from datetime import datetime

from ..models import InterviewState, InterviewStage, InterviewQuestions
from .llm_service import llm_service
from .state_service import get_state_service
from config import settings

# 使用多维表格 API 服务（支持实时查询 + 本地缓存）
from .bitable_api_service import bitable_api_service as bitable_service
# Webhook 服务用于保存记录
from .bitable_webhook_service import bitable_webhook_service as webhook_service

logger = logging.getLogger(__name__)


# 开场白模板
WELCOME_MESSAGE = """您好，我是飞书企业访谈助手"探探"。
我需要和您进行一段的访谈🎤，预计10余个问题，大约15分钟⌚。在调研过程中，我会精准记录您提出的业务痛点、功能需求与落地期望。

为了确保调研结果的准确性与实用性，恳请您在交流中尽可能详细地描述相关业务场景🎬。

此外，您完全可以放心，本次调研中涉及的所有企业信息、业务数据及需求内容，均会严格遵守数据保密协议🔒。

在正式开始之前，需要和您确认一些信息：**请问您所在的公司是哪家？以及您的全名是什么？**

确认您的这些信息便于选取和您更加匹配的调研问题。"""


class InterviewController:
    """访谈控制器"""
    
    def __init__(self):
        self.state_service = get_state_service()
    
    async def create_session(self) -> Tuple[str, str]:
        """创建新的访谈会话
        
        Returns:
            tuple: (session_id, welcome_message)
        """
        state = await self.state_service.create_session()
        state.stage = InterviewStage.COLLECT
        state.add_message("assistant", WELCOME_MESSAGE)
        await self.state_service.update_session(state)
        
        return state.session_id, WELCOME_MESSAGE
    
    async def process_message(self, session_id: str, user_message: str) -> Tuple[str, InterviewState]:
        """处理用户消息
        
        Args:
            session_id: 会话ID
            user_message: 用户消息
            
        Returns:
            tuple: (assistant_reply, updated_state)
        """
        # 获取会话状态
        state = await self.state_service.get_session(session_id)
        if not state:
            raise ValueError(f"会话不存在: {session_id}")
        
        # 记录用户消息
        state.add_message("user", user_message)
        
        # 根据当前阶段处理
        reply = ""
        
        if state.stage == InterviewStage.COLLECT:
            reply = await self._handle_collect(state, user_message)
        
        elif state.stage == InterviewStage.INTERVIEW:
            reply = await self._handle_interview(state, user_message)
        
        elif state.stage == InterviewStage.THANKS:
            reply = await self._handle_thanks(state)
        
        elif state.stage == InterviewStage.COMPLETED:
            reply = "访谈已结束，感谢您的参与！如需重新开始，请刷新页面。"
        
        else:
            reply = "抱歉，系统出现了一些问题，请稍后重试。"
        
        # 记录助手回复
        state.add_message("assistant", reply)
        
        # 保存状态
        await self.state_service.update_session(state)
        
        return reply, state
    
    async def _handle_collect(self, state: InterviewState, user_message: str) -> str:
        """处理信息收集阶段"""
        # 提取用户信息
        try:
            info = await llm_service.extract_user_info(user_message)
            state.token_count += info.get("tokens_used", 0)
            
            company = info.get("company")
            surname = info.get("surname")
            full_name = info.get("full_name")
            confidence = info.get("confidence", 0)
            
            # 保存用户信息
            state.user.company = company
            state.user.surname = surname
            state.user.full_name = full_name
            state.user.raw_input = user_message
            
            # 检查信息是否完整
            if confidence < 0.5 or not company or not surname:
                return "抱歉，我没有完全理解您的信息。能否请您再说一下您的**姓名**和**公司名称**？例如：'我是小米的王俊'"
            
            # 获取问题
            questions = await bitable_service.get_questions_by_company(company)
            logger.info(f"获取到的问题: PART1={len(questions.get('part1', []))}个, PART2={len(questions.get('part2', []))}个, PART3={len(questions.get('part3', []))}个")
            state.questions = InterviewQuestions(**questions)
            logger.info(f"保存到state后: PART1={len(state.questions.part1)}个, PART2={len(state.questions.part2)}个, PART3={len(state.questions.part3)}个")
            
            # 切换到访谈阶段
            state.stage = InterviewStage.INTERVIEW
            state.progress.current_part = 1
            state.progress.current_question_index = 0
            
            # 生成访谈开始语
            reply, tokens = await llm_service.generate_interview_start(
                surname=surname,
                company=company,
                part1_questions=state.questions.part1,
                part2_questions=state.questions.part2,
                part3_questions=state.questions.part3
            )
            state.token_count += tokens
            
            return reply
            
        except Exception as e:
            logger.error(f"信息收集处理失败: {e}")
            return "抱歉，处理您的信息时出现了问题。能否请您重新输入您的姓名和公司？"
    
    async def _handle_interview(self, state: InterviewState, user_message: str) -> str:
        """处理访谈阶段"""
        try:
            # 检查用户是否想要结束访谈
            end_keywords = ["结束", "跳过所有", "跳过剩下", "没时间", "时间有限", "不想回答了", "就到这里", "结束吧", "停止访谈"]
            user_wants_to_end = any(keyword in user_message for keyword in end_keywords)
            
            # 获取当前问题
            current_question = state.get_current_question()
            
            if current_question:
                # 记录回答
                question_id = f"part{state.progress.current_part}_q{state.progress.current_question_index}"
                state.add_answer(
                    question_id=question_id,
                    question=current_question,
                    answer=user_message,
                    part=state.progress.current_part
                )
            
            # 如果用户想要结束，直接进入感谢阶段
            if user_wants_to_end:
                logger.info(f"用户主动结束访谈: {user_message}")
                state.stage = InterviewStage.THANKS
                return await self._handle_thanks(state)
            
            # 推进到下一个问题
            has_more = state.advance_progress()
            
            if not has_more:
                # 所有问题完成，进入感谢阶段
                state.stage = InterviewStage.THANKS
                return await self._handle_thanks(state)
            
            # 获取下一个问题
            next_question = state.get_current_question()
            
            # 构建对话历史
            history = [{"role": m.role, "content": m.content} for m in state.history]
            
            # 生成回复
            reply, tokens = await llm_service.generate_interview_response(
                surname=state.user.surname,
                company=state.user.company,
                current_part=state.progress.current_part,
                current_question_index=state.progress.current_question_index,
                part1_questions=state.questions.part1,
                part2_questions=state.questions.part2,
                part3_questions=state.questions.part3,
                current_question=next_question,
                conversation_history=history,
                user_message=user_message
            )
            state.token_count += tokens
            
            return reply
            
        except Exception as e:
            logger.error(f"访谈处理失败: {e}")
            return "抱歉，处理您的回答时出现了问题。让我们继续下一个问题..."
    
    async def _handle_thanks(self, state: InterviewState) -> str:
        """处理感谢结束阶段"""
        try:
            # 生成感谢语
            reply, tokens = await llm_service.generate_thanks(state.user.surname)
            state.token_count += tokens
            
            # 切换到总结阶段
            state.stage = InterviewStage.SUMMARY
            
            # 异步生成总结并保存（不阻塞响应）
            await self._generate_and_save_summary(state)
            
            state.stage = InterviewStage.COMPLETED
            
            return reply
            
        except Exception as e:
            logger.error(f"生成感谢语失败: {e}")
            state.stage = InterviewStage.COMPLETED
            return f"我们的访谈结束了，非常感谢{state.user.surname or '您'}抽出宝贵的时间！"
    
    async def _generate_and_save_summary(self, state: InterviewState):
        """生成总结并保存到多维表格"""
        try:
            # 准备问答列表
            qa_list = [
                {
                    "question": a.question,
                    "answer": a.answer,
                    "part": a.part
                }
                for a in state.answers
            ]
            
            # 生成总结
            summary, tokens = await llm_service.generate_summary(
                full_name=state.user.full_name or state.user.surname,
                company=state.user.company,
                interview_time=state.created_at.strftime("%Y-%m-%d %H:%M"),
                qa_list=qa_list
            )
            state.token_count += tokens
            state.summary = summary
            
            # 保存到多维表格
            conversation_json = json.dumps(
                [{"role": m.role, "content": m.content} for m in state.history],
                ensure_ascii=False
            )
            
            user_input_summary = f"{state.user.full_name or state.user.surname}, 来自{state.user.company}"
            
            await bitable_service.save_interview_record(
                session_id=state.session_id,
                user_name=state.user.full_name or state.user.surname or "未知",
                company=state.user.company or "未知",
                user_input_summary=user_input_summary,
                conversation_history=conversation_json,
                skill_name="AI赋能专家",
                status="对话成功",
                token_count=state.token_count,
                summary=summary
            )
            
            logger.info(f"访谈总结已保存: {state.session_id}")
            
        except Exception as e:
            logger.error(f"生成/保存总结失败: {e}")
    
    async def get_summary(self, session_id: str) -> dict:
        """获取访谈总结
        
        Returns:
            dict: {summary, answers, user_info}
        """
        state = await self.state_service.get_session(session_id)
        if not state:
            raise ValueError(f"会话不存在: {session_id}")
        
        return {
            "summary": state.summary,
            "answers": [a.model_dump() for a in state.answers],
            "user_info": state.user.model_dump(),
            "token_count": state.token_count,
            "stage": state.stage.value
        }


# 全局单例
interview_controller = InterviewController()

