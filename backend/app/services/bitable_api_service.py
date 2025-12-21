"""
飞书多维表格 API 服务
直接调用飞书开放平台 API 查询多维表格数据

工作流程：
1. 优先从本地缓存读取（快）
2. 缓存未命中 → 调用飞书 API 查询
3. 查询结果写入本地缓存
"""
import json
import logging
import os
from typing import Optional, Dict, Any, List
from datetime import datetime
import httpx

from config import settings

logger = logging.getLogger(__name__)

# 本地缓存文件路径
CACHE_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
    "data",
    "questions_cache.json"
)


class BitableAPIService:
    """
    通过飞书开放平台 API 直接查询多维表格
    
    需要配置：
    - FEISHU_APP_ID: 飞书应用 ID
    - FEISHU_APP_SECRET: 飞书应用密钥
    - BITABLE_APP_TOKEN: 多维表格的 app_token
    - BITABLE_QUESTIONS_TABLE_ID: 问题表的 table_id
    """
    
    def __init__(self):
        self.app_id = settings.FEISHU_APP_ID
        self.app_secret = settings.FEISHU_APP_SECRET
        self.app_token = settings.BITABLE_APP_TOKEN
        self.table_id = settings.BITABLE_QUESTIONS_TABLE_ID
        
        # 飞书 API 基础地址
        self.base_url = "https://open.feishu.cn/open-apis"
        
        # 访问令牌缓存
        self._access_token: Optional[str] = None
        self._token_expires_at: float = 0
        
        # 加载本地缓存
        self._cache = self._load_cache()
        
        # 检查配置
        self._check_config()
    
    def _check_config(self):
        """检查必要配置"""
        if self.app_id and self.app_secret and self.app_token and self.table_id:
            logger.info("飞书 API 配置完整，支持实时查询多维表格")
        else:
            missing = []
            if not self.app_id: missing.append("FEISHU_APP_ID")
            if not self.app_secret: missing.append("FEISHU_APP_SECRET")
            if not self.app_token: missing.append("BITABLE_APP_TOKEN")
            if not self.table_id: missing.append("BITABLE_QUESTIONS_TABLE_ID")
            logger.warning(f"飞书 API 配置不完整，缺少: {', '.join(missing)}。将使用本地缓存或默认问题")
    
    def _load_cache(self) -> Dict[str, Any]:
        """加载本地缓存"""
        try:
            if os.path.exists(CACHE_PATH):
                with open(CACHE_PATH, 'r', encoding='utf-8') as f:
                    cache = json.load(f)
                    companies = cache.get("companies", {})
                    logger.info(f"加载问题缓存成功，共 {len(companies)} 个公司")
                    return cache
        except Exception as e:
            logger.error(f"加载缓存失败: {e}")
        return {"companies": {}, "updated_at": None}
    
    def _save_cache(self):
        """保存缓存到本地文件"""
        try:
            # 确保目录存在
            os.makedirs(os.path.dirname(CACHE_PATH), exist_ok=True)
            
            self._cache["updated_at"] = datetime.now().isoformat()
            with open(CACHE_PATH, 'w', encoding='utf-8') as f:
                json.dump(self._cache, f, ensure_ascii=False, indent=2)
            logger.info(f"缓存已保存，共 {len(self._cache.get('companies', {}))} 个公司")
        except Exception as e:
            logger.error(f"保存缓存失败: {e}")
    
    async def _get_access_token(self) -> Optional[str]:
        """获取飞书访问令牌"""
        import time
        
        # 检查缓存的令牌是否有效
        if self._access_token and time.time() < self._token_expires_at - 60:
            return self._access_token
        
        if not self.app_id or not self.app_secret:
            return None
        
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.post(
                    f"{self.base_url}/auth/v3/tenant_access_token/internal",
                    json={
                        "app_id": self.app_id,
                        "app_secret": self.app_secret
                    }
                )
                
                if response.status_code == 200:
                    data = response.json()
                    if data.get("code") == 0:
                        self._access_token = data.get("tenant_access_token")
                        self._token_expires_at = time.time() + data.get("expire", 7200)
                        logger.info("获取飞书访问令牌成功")
                        return self._access_token
                    else:
                        logger.error(f"获取令牌失败: {data.get('msg')}")
                else:
                    logger.error(f"获取令牌请求失败: {response.status_code}")
        except Exception as e:
            logger.error(f"获取访问令牌异常: {e}")
        
        return None
    
    async def _query_bitable(self, company_name: str) -> Optional[Dict[str, List[str]]]:
        """
        从飞书多维表格查询问题
        
        Args:
            company_name: 公司名称
            
        Returns:
            dict: {part1: [...], part2: [...], part3: [...]} 或 None
        """
        token = await self._get_access_token()
        if not token:
            logger.warning("无法获取访问令牌，跳过飞书查询")
            return None
        
        if not self.app_token or not self.table_id:
            logger.warning("多维表格配置不完整，跳过查询")
            return None
        
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                # 构建筛选条件：精确匹配公司名称
                # 飞书 Bitable API 筛选语法
                filter_formula = f'CurrentValue.[被调研公司名称] = "{company_name}"'
                
                response = await client.get(
                    f"{self.base_url}/bitable/v1/apps/{self.app_token}/tables/{self.table_id}/records",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json"
                    },
                    params={
                        "filter": filter_formula,
                        "page_size": 1
                    }
                )
                
                if response.status_code == 200:
                    data = response.json()
                    if data.get("code") == 0:
                        items = data.get("data", {}).get("items", [])
                        if items:
                            record = items[0].get("fields", {})
                            result = {
                                "part1": self._parse_questions(record.get("part1", "")),
                                "part2": self._parse_questions(record.get("part2", "")),
                                "part3": self._parse_questions(record.get("part3", ""))
                            }
                            logger.info(f"从飞书查询到 {company_name} 的问题")
                            return result
                        else:
                            logger.info(f"飞书未找到 {company_name} 的记录")
                    else:
                        logger.error(f"飞书查询失败: {data.get('msg')}")
                else:
                    logger.error(f"飞书请求失败: {response.status_code} - {response.text}")
        except Exception as e:
            logger.error(f"查询飞书多维表格异常: {e}")
        
        return None
    
    def _parse_questions(self, text: Any) -> List[str]:
        """解析问题文本，支持多种格式"""
        if not text:
            return []
        
        # 如果是列表直接返回
        if isinstance(text, list):
            return [str(q).strip() for q in text if str(q).strip()]
        
        # 如果是字符串，按换行或分号分割
        if isinstance(text, str):
            # 尝试按换行分割
            lines = text.strip().split("\n")
            questions = []
            for line in lines:
                line = line.strip()
                if line:
                    # 移除序号前缀（如 "1." "1、" "(1)" 等）
                    import re
                    line = re.sub(r'^[\d]+[.、)）\s]+', '', line)
                    if line:
                        questions.append(line)
            return questions
        
        return []
    
    async def get_questions_by_company(self, company_name: str) -> Dict[str, List[str]]:
        """
        根据公司名称获取问题
        
        优先级：
        1. 本地缓存精确匹配
        2. 飞书 API 查询 → 写入缓存
        3. 本地缓存"默认"配置
        4. 硬编码默认问题
        """
        companies = self._cache.get("companies", {})
        
        # 1. 本地缓存精确匹配
        if company_name in companies:
            logger.info(f"缓存命中: {company_name}")
            return companies[company_name]
        
        # 2. 尝试从飞书查询
        feishu_result = await self._query_bitable(company_name)
        if feishu_result:
            # 写入缓存
            self._cache.setdefault("companies", {})[company_name] = feishu_result
            self._save_cache()
            return feishu_result
        
        # 3. 查询"默认"配置
        default_result = await self._query_bitable("默认")
        if default_result:
            # 也缓存默认配置
            self._cache.setdefault("companies", {})["默认"] = default_result
            self._save_cache()
            return default_result
        
        # 4. 使用本地缓存的"默认"
        if "默认" in companies:
            logger.info("使用缓存的默认配置")
            return companies["默认"]
        
        # 5. 硬编码兜底
        logger.warning("使用硬编码默认问题")
        return self._get_hardcoded_defaults()
    
    def _get_hardcoded_defaults(self) -> Dict[str, List[str]]:
        """硬编码的默认问题（兜底方案）"""
        return {
            "part1": [
                "请问您负责的部门主要承担哪些职能？",
                "您日常工作中最核心的业务流程有哪些？",
                "目前团队规模大概是多少人？",
                "在日常协作中，您主要使用哪些工具和系统？",
                "您认为当前工作流程中最大的痛点是什么？"
            ],
            "part2": [
                "您日常工作中非定期性的临时任务多吗？如何管理？",
                "跨部门协作时，信息传递是否顺畅？",
                "您的团队在知识沉淀方面做得如何？",
                "审批流程的效率如何？有没有优化空间？",
                "您对数字化工具的使用体验如何？"
            ],
            "part3": [
                "除了上述问题外，您还有哪些想要补充的内容？"
            ]
        }
    
    def clear_cache(self, company_name: Optional[str] = None):
        """
        清除缓存
        
        Args:
            company_name: 指定公司名称，None 表示清除全部
        """
        if company_name:
            self._cache.get("companies", {}).pop(company_name, None)
            logger.info(f"已清除 {company_name} 的缓存")
        else:
            self._cache = {"companies": {}, "updated_at": None}
            logger.info("已清除全部缓存")
        self._save_cache()
    
    def reload_cache(self):
        """重新加载缓存"""
        self._cache = self._load_cache()
    
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
        或直接调用飞书 API 创建记录
        """
        records_webhook_url = settings.WEBHOOK_RECORDS_URL
        records_table_id = settings.BITABLE_RECORDS_TABLE_ID
        
        # 方式1：通过 Webhook 保存（推荐）
        if records_webhook_url:
            return await self._save_via_webhook(
                records_webhook_url,
                session_id, user_name, company, user_input_summary,
                conversation_history, skill_name, status, token_count, summary
            )
        
        # 方式2：通过 API 直接创建记录
        if self.app_token and records_table_id:
            return await self._save_via_api(
                records_table_id,
                session_id, user_name, company, user_input_summary,
                conversation_history, skill_name, status, token_count, summary
            )
        
        logger.warning("未配置记录保存方式（WEBHOOK_RECORDS_URL 或 BITABLE_RECORDS_TABLE_ID），跳过保存")
        return False
    
    async def _save_via_webhook(
        self,
        webhook_url: str,
        session_id: str,
        user_name: str,
        company: str,
        user_input_summary: str,
        conversation_history: str,
        skill_name: str,
        status: str,
        token_count: int,
        summary: str
    ) -> bool:
        """通过 Webhook 保存记录"""
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                # 使用 data 包裹，与飞书自动化流程的字段映射匹配
                response = await client.post(
                    webhook_url,
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
                    logger.info(f"访谈记录保存成功(Webhook): {session_id}")
                    return True
                else:
                    logger.error(f"保存记录失败(Webhook): {response.status_code}")
                    return False
                    
        except Exception as e:
            logger.error(f"保存记录出错(Webhook): {e}")
            return False
    
    async def _save_via_api(
        self,
        table_id: str,
        session_id: str,
        user_name: str,
        company: str,
        user_input_summary: str,
        conversation_history: str,
        skill_name: str,
        status: str,
        token_count: int,
        summary: str
    ) -> bool:
        """通过飞书 API 直接创建记录"""
        token = await self._get_access_token()
        if not token:
            logger.warning("无法获取访问令牌，保存失败")
            return False
        
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    f"{self.base_url}/bitable/v1/apps/{self.app_token}/tables/{table_id}/records",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "fields": {
                            "ID": session_id,
                            "用户": user_name,
                            "公司": company,
                            "对话记录": conversation_history,
                            "执行状态": status,
                            "Token消耗": token_count,
                            "访谈分析": summary
                        }
                    }
                )
                
                if response.status_code == 200:
                    data = response.json()
                    if data.get("code") == 0:
                        logger.info(f"访谈记录保存成功(API): {session_id}")
                        return True
                    else:
                        logger.error(f"保存记录失败(API): {data.get('msg')}")
                        return False
                else:
                    logger.error(f"保存记录请求失败(API): {response.status_code}")
                    return False
                    
        except Exception as e:
            logger.error(f"保存记录出错(API): {e}")
            return False


# 全局单例
bitable_api_service = BitableAPIService()

