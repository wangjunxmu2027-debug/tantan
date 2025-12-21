"""
飞书多维表格 Webhook 服务
通过多维表格的自动化流程来实现数据读写，无需创建飞书应用

支持三种模式：
1. 本地JSON配置：从 data/questions.json 文件读取（本地开发推荐）
2. 异步回调模式：通过飞书自动化流程查询并回调结果（需要公网地址）
3. 硬编码默认问题：作为兜底方案
"""
import json
import logging
import asyncio
import uuid
import os
from typing import Optional, Dict, Any, List
import httpx

from config import settings

logger = logging.getLogger(__name__)

# 问题配置文件路径
QUESTIONS_CONFIG_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
    "data",
    "questions.json"
)


class BitableWebhookService:
    """
    通过 Webhook + 自动化流程与飞书多维表格交互
    
    异步回调模式的工作流程：
    1. 发送请求到飞书 Webhook，携带 request_id 和 callback_url
    2. 飞书自动化流程执行"查找记录"
    3. 自动化流程执行"发送HTTP请求"，把结果回调到我们的 callback_url
    4. 我们的回调端点接收数据，通过 request_id 匹配并返回结果
    """
    
    def __init__(self):
        # 查询问题的 Webhook 地址
        self.questions_webhook_url = settings.WEBHOOK_QUESTIONS_URL
        # 保存记录的 Webhook 地址  
        self.records_webhook_url = settings.WEBHOOK_RECORDS_URL
        # 回调接收地址（用于接收查询结果）
        self.callback_url = settings.WEBHOOK_CALLBACK_URL
        
        # 存储待接收的回调结果 {request_id: asyncio.Future}
        self._pending_callbacks: Dict[str, asyncio.Future] = {}
        
        # 回调超时时间（秒）
        self.callback_timeout = 10
        
        # 加载本地问题配置
        self._questions_config = self._load_questions_config()
    
    def _load_questions_config(self) -> Dict[str, Any]:
        """加载本地问题配置文件"""
        try:
            if os.path.exists(QUESTIONS_CONFIG_PATH):
                with open(QUESTIONS_CONFIG_PATH, 'r', encoding='utf-8') as f:
                    config = json.load(f)
                    companies = config.get("companies", {})
                    logger.info(f"加载问题配置成功，共 {len(companies)} 个公司配置")
                    return companies
            else:
                logger.warning(f"问题配置文件不存在: {QUESTIONS_CONFIG_PATH}")
                return {}
        except Exception as e:
            logger.error(f"加载问题配置失败: {e}")
            return {}
    
    async def get_questions_by_company(self, company_name: str) -> Dict[str, List[str]]:
        """
        根据公司名称获取对应的访谈问题
        
        优先级：
        1. 从本地 JSON 配置文件读取（本地开发推荐）
        2. 如果配置了回调URL，使用异步回调模式等待飞书返回数据
        3. 使用硬编码的默认问题作为兜底
        
        Args:
            company_name: 公司核心品牌词
            
        Returns:
            dict: {part1: [...], part2: [...], part3: [...]}
        """
        # 优先从本地配置读取
        local_questions = self._get_questions_from_config(company_name)
        if local_questions:
            return local_questions
        
        # 如果没有本地配置，尝试通过 Webhook 获取
        if self.questions_webhook_url and self.callback_url:
            request_id = str(uuid.uuid4())
            try:
                return await self._get_questions_with_callback(company_name, request_id)
            except Exception as e:
                logger.error(f"Webhook获取问题失败: {e}")
        
        # 兜底：使用硬编码默认问题
        logger.info("使用硬编码默认问题")
        return self._get_default_questions()
    
    def _get_questions_from_config(self, company_name: str) -> Optional[Dict[str, List[str]]]:
        """
        从本地配置文件获取问题
        
        匹配逻辑：
        1. 精确匹配公司名称
        2. 模糊匹配（公司名称包含关键词）
        3. 使用"默认"配置
        """
        if not self._questions_config:
            return None
        
        # 1. 精确匹配
        if company_name in self._questions_config:
            logger.info(f"精确匹配到公司配置: {company_name}")
            return self._questions_config[company_name]
        
        # 2. 模糊匹配
        for config_company in self._questions_config:
            if config_company == "默认":
                continue
            if config_company in company_name or company_name in config_company:
                logger.info(f"模糊匹配到公司配置: {company_name} -> {config_company}")
                return self._questions_config[config_company]
        
        # 3. 使用默认配置
        if "默认" in self._questions_config:
            logger.info(f"使用默认配置: {company_name}")
            return self._questions_config["默认"]
        
        return None
    
    async def _get_questions_with_callback(self, company_name: str, request_id: str) -> Dict[str, List[str]]:
        """
        通过异步回调模式获取问题
        
        1. 发送请求到飞书 Webhook
        2. 等待飞书自动化流程回调结果
        3. 超时则使用默认问题
        """
        # 创建 Future 用于等待回调
        future = asyncio.get_event_loop().create_future()
        self._pending_callbacks[request_id] = future
        
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                # 发送查询请求到 Webhook
                logger.info(f"发送查询请求: company={company_name}, request_id={request_id}")
                response = await client.post(
                    self.questions_webhook_url,
                    json={
                        "action": "query",
                        "company": company_name,
                        "request_id": request_id,
                        "callback_url": self.callback_url
                    }
                )
                
                logger.info(f"Webhook响应状态: {response.status_code}")
                
                if response.status_code != 200:
                    logger.warning(f"Webhook请求失败: {response.status_code}")
                    return self._get_default_questions()
            
            # 等待回调结果
            try:
                logger.info(f"等待回调结果，超时时间: {self.callback_timeout}秒")
                result = await asyncio.wait_for(future, timeout=self.callback_timeout)
                
                if result and self._has_valid_questions(result):
                    logger.info(f"从回调获取到问题数据")
                    return {
                        "part1": self._parse_questions(result.get("part1", "")),
                        "part2": self._parse_questions(result.get("part2", "")),
                        "part3": self._parse_questions(result.get("part3", ""))
                    }
                else:
                    logger.info("回调数据无效，使用默认问题")
                    return self._get_default_questions()
                    
            except asyncio.TimeoutError:
                logger.warning(f"等待回调超时({self.callback_timeout}s)，使用默认问题")
                return self._get_default_questions()
                
        finally:
            # 清理
            self._pending_callbacks.pop(request_id, None)
    
    def receive_callback(self, request_id: str, data: Dict[str, Any]) -> bool:
        """
        接收飞书自动化流程的回调数据
        
        Args:
            request_id: 请求ID
            data: 回调数据，应包含 part1, part2, part3
            
        Returns:
            bool: 是否成功处理
        """
        future = self._pending_callbacks.get(request_id)
        if future and not future.done():
            future.set_result(data)
            logger.info(f"收到回调: request_id={request_id}")
            return True
        else:
            logger.warning(f"未找到待处理的请求: request_id={request_id}")
            return False
    
    def _has_valid_questions(self, data: Dict[str, Any]) -> bool:
        """检查数据中是否包含有效的问题"""
        return (
            (data.get("part1") and len(str(data.get("part1")).strip()) > 0) or
            (data.get("part2") and len(str(data.get("part2")).strip()) > 0) or
            (data.get("part3") and len(str(data.get("part3")).strip()) > 0)
        )
    
    async def save_interview_record(
        self,
        session_id: str,
        user_name: str,
        company: str,
        user_input_summary: str,
        conversation_history: str,
        skill_name: str,
        status: str,
        token_count: int,
        summary: str = ""
    ) -> bool:
        """
        保存访谈记录到多维表格
        
        通过 Webhook 触发"新增记录"自动化流程
        """
        if not self.records_webhook_url:
            logger.warning("未配置记录保存Webhook，跳过保存")
            return False
        
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    self.records_webhook_url,
                    json={
                        "action": "create",
                        "data": {
                            "ID": session_id,
                            "用户": user_name,
                            "公司": company,
                            "用户输入": user_input_summary,
                            "对话记录": conversation_history,
                            "命中技能": skill_name,
                            "执行状态": status,
                            "Token消耗": token_count,
                            "访谈分析": summary
                        }
                    }
                )
                
                if response.status_code == 200:
                    logger.info(f"访谈记录保存成功: {session_id}")
                    return True
                else:
                    logger.error(f"保存记录失败: {response.status_code}")
                    return False
                    
        except Exception as e:
            logger.error(f"保存记录出错: {e}")
            return False
    
    def _parse_questions(self, text: Any) -> List[str]:
        """解析问题文本"""
        if not text:
            return []
        
        if isinstance(text, list):
            return text
        
        if isinstance(text, str):
            # 按换行分割
            lines = text.strip().split("\n")
            questions = []
            for line in lines:
                line = line.strip()
                if line:
                    # 移除序号
                    import re
                    line = re.sub(r'^[\d]+[.、)）\s]+', '', line)
                    if line:
                        questions.append(line)
            return questions
        
        return []
    
    def _get_default_questions(self) -> Dict[str, List[str]]:
        """返回默认问题集"""
        return {
            "part1": [
                "「市场活动」相关工作在你日常出现的频率如何（1-5从低到高）？工作量占比如何？你希望该工作在什么标准下启动？未来希望在这项工作中如何与Leader分工？",
                "AI大讲堂相关工作在你日常出现的频率如何（1-5从低到高）？工作量占比如何？你希望该工作在什么标准下启动？未来希望在这项工作中如何与Leader分工？",
                "走进字节相关工作在你日常出现的频率如何（1-5从低到高）？工作量占比如何？你希望该工作在什么标准下启动？未来希望在这项工作中如何与Leader分工？",
                "建联材料相关工作在你日常出现的频率如何（1-5从低到高）？工作量占比如何？你希望该工作在什么标准下启动？未来希望在这项工作中如何与Leader分工？",
                "FP相关工作在你日常出现的频率如何（1-5从低到高）？工作量占比如何？你希望该工作在什么标准下启动？未来希望在这项工作中如何与Leader分工？",
                "高层Pitch相关工作在你日常出现的频率如何（1-5从低到高）？工作量占比如何？你希望该工作在什么标准下启动？未来希望在这项工作中如何与Leader分工？",
                "轻调研-需求了解相关工作在你日常出现的频率如何（1-5从低到高）？工作量占比如何？你希望该工作在什么标准下启动？未来希望在这项工作中如何与Leader分工？",
                "重调研POC相关工作在你日常出现的频率如何（1-5从低到高）？工作量占比如何？你希望该工作在什么标准下启动？未来希望在这项工作中如何与Leader分工？",
            ],
            "part2": [
                "高层汇报相关工作在你日常出现的频率如何（1-5从低到高）？工作量占比如何？你希望该工作在什么标准下启动？未来希望在这项工作中如何与Leader分工？",
                "POV相关工作在你日常出现的频率如何（1-5从低到高）？工作量占比如何？你希望该工作在什么标准下启动？未来希望在这项工作中如何与Leader分工？",
                "迁移评估相关工作在你日常出现的频率如何（1-5从低到高）？工作量占比如何？你希望该工作在什么标准下启动？未来希望在这项工作中如何与Leader分工？",
                "安全评估相关工作在你日常出现的频率如何（1-5从低到高）？工作量占比如何？你希望该工作在什么标准下启动？未来希望在这项工作中如何与Leader分工？",
                "日常答疑相关工作在你日常出现的频率如何（1-5从低到高）？工作量占比如何？你希望该工作在什么标准下启动？未来希望在这项工作中如何与Leader分工？",
                "培训分享相关工作在你日常出现的频率如何（1-5从低到高）？工作量占比如何？你希望该工作在什么标准下启动？未来希望在这项工作中如何与Leader分工？",
                "服务计划制定相关工作在你日常出现的频率如何（1-5从低到高）？工作量占比如何？你希望该工作在什么标准下启动？未来希望在这项工作中如何与Leader分工？",
                "售后支持相关工作在你日常出现的频率如何（1-5从低到高）？工作量占比如何？你希望该工作在什么标准下启动？未来希望在这项工作中如何与Leader分工？",
            ],
            "part3": [
                "除了上述问题外，您还有哪些想要补充的内容？"
            ]
        }


# 全局单例
bitable_webhook_service = BitableWebhookService()

