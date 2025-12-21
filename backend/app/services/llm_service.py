"""
LLM服务 - 封装与LLM API的交互
"""
import json
import re
from typing import Optional, Dict, Any, List
from openai import AsyncOpenAI
import logging

from ..prompts import (
    get_extract_info_prompt,
    get_interview_prompt,
    get_interview_start_prompt,
    get_thanks_prompt,
    get_summary_prompt
)
from config import settings

logger = logging.getLogger(__name__)


class LLMService:
    """LLM服务类"""
    
    def __init__(self):
        self.client = AsyncOpenAI(
            api_key=settings.LLM_API_KEY,
            base_url=settings.LLM_API_BASE_URL
        )
        self.model = settings.LLM_MODEL
    
    async def _call_llm(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 2000
    ) -> tuple[str, int]:
        """调用LLM API
        
        Returns:
            tuple: (response_content, total_tokens)
        """
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens
            )
            
            content = response.choices[0].message.content
            total_tokens = response.usage.total_tokens if response.usage else 0
            
            return content, total_tokens
            
        except Exception as e:
            logger.error(f"LLM API调用失败: {e}")
            raise
    
    async def extract_user_info(self, user_input: str) -> Dict[str, Any]:
        """从用户输入中提取公司和姓名信息
        
        Args:
            user_input: 用户的原始输入
            
        Returns:
            dict: {company, surname, full_name, confidence}
        """
        prompt = get_extract_info_prompt(user_input)
        
        messages = [
            {"role": "system", "content": "你是一个信息提取助手，请严格按照要求的JSON格式输出。"},
            {"role": "user", "content": prompt}
        ]
        
        response, tokens = await self._call_llm(messages, temperature=0.1, max_tokens=500)
        
        # 解析JSON响应
        try:
            # 尝试直接解析
            result = json.loads(response)
        except json.JSONDecodeError:
            # 尝试从响应中提取JSON
            json_match = re.search(r'\{[^{}]*\}', response, re.DOTALL)
            if json_match:
                try:
                    result = json.loads(json_match.group())
                except json.JSONDecodeError:
                    result = {
                        "company": None,
                        "surname": None,
                        "full_name": None,
                        "confidence": 0.0
                    }
            else:
                result = {
                    "company": None,
                    "surname": None,
                    "full_name": None,
                    "confidence": 0.0
                }
        
        result["tokens_used"] = tokens
        return result
    
    async def generate_interview_start(
        self,
        surname: str,
        company: str,
        part1_questions: list,
        part2_questions: list,
        part3_questions: list
    ) -> tuple[str, int]:
        """生成访谈开始语
        
        Returns:
            tuple: (response, tokens_used)
        """
        first_question = part1_questions[0] if part1_questions else "请介绍一下您的主要工作内容"
        
        prompt = get_interview_start_prompt(
            surname=surname,
            company=company,
            part1_questions=part1_questions,
            part2_questions=part2_questions,
            part3_questions=part3_questions,
            first_question=first_question
        )
        
        messages = [
            {"role": "user", "content": prompt}
        ]
        
        return await self._call_llm(messages, temperature=0.7, max_tokens=1000)
    
    async def generate_interview_response(
        self,
        surname: str,
        company: str,
        current_part: int,
        current_question_index: int,
        part1_questions: list,
        part2_questions: list,
        part3_questions: list,
        current_question: str,
        conversation_history: List[Dict[str, str]],
        user_message: str
    ) -> tuple[str, int]:
        """生成访谈回复
        
        Returns:
            tuple: (response, tokens_used)
        """
        # 格式化对话历史
        history_str = ""
        for msg in conversation_history[-10:]:  # 只保留最近10轮对话
            role_name = "助手" if msg["role"] == "assistant" else "用户"
            history_str += f"{role_name}: {msg['content']}\n\n"
        
        prompt = get_interview_prompt(
            surname=surname,
            company=company,
            current_part=current_part,
            current_question_index=current_question_index,
            part1_questions=part1_questions,
            part2_questions=part2_questions,
            part3_questions=part3_questions,
            current_question=current_question,
            conversation_history=history_str,
            user_message=user_message
        )
        
        messages = [
            {"role": "system", "content": prompt},
            {"role": "user", "content": user_message}
        ]
        
        return await self._call_llm(messages, temperature=0.7, max_tokens=1500)
    
    async def generate_thanks(self, surname: str) -> tuple[str, int]:
        """生成感谢结束语
        
        Returns:
            tuple: (response, tokens_used)
        """
        prompt = get_thanks_prompt(surname)
        
        messages = [
            {"role": "user", "content": prompt}
        ]
        
        return await self._call_llm(messages, temperature=0.7, max_tokens=500)
    
    async def generate_summary(
        self,
        full_name: str,
        company: str,
        interview_time: str,
        qa_list: list
    ) -> tuple[str, int]:
        """生成访谈总结分析
        
        Returns:
            tuple: (summary, tokens_used)
        """
        prompt = get_summary_prompt(
            full_name=full_name,
            company=company,
            interview_time=interview_time,
            qa_list=qa_list
        )
        
        messages = [
            {"role": "system", "content": "你是一位专业的商业分析师，请根据访谈记录生成结构化的分析报告。"},
            {"role": "user", "content": prompt}
        ]
        
        return await self._call_llm(messages, temperature=0.5, max_tokens=3000)


# 全局单例
llm_service = LLMService()

