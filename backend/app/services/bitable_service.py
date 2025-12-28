"""
飞书多维表格服务 - 处理问题检索和记录保存
"""
import json
import logging
from typing import Optional, Dict, Any, List
import httpx

from config import settings

logger = logging.getLogger(__name__)


class BitableService:
    """飞书多维表格服务"""
    
    def __init__(self):
        self.app_id = settings.FEISHU_APP_ID
        self.app_secret = settings.FEISHU_APP_SECRET
        self.app_token = settings.BITABLE_APP_TOKEN
        self.questions_table_id = settings.BITABLE_QUESTIONS_TABLE_ID
        self.records_table_id = settings.BITABLE_RECORDS_TABLE_ID
        self._tenant_access_token = None
        self._token_expire_time = 0
    
    async def _get_tenant_access_token(self) -> str:
        """获取tenant_access_token"""
        import time
        
        # 检查token是否过期
        if self._tenant_access_token and time.time() < self._token_expire_time - 60:
            return self._tenant_access_token
        
        url = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal"
        
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json={
                "app_id": self.app_id,
                "app_secret": self.app_secret
            })
            
            data = response.json()
            
            if data.get("code") == 0:
                self._tenant_access_token = data["tenant_access_token"]
                self._token_expire_time = time.time() + data.get("expire", 7200)
                return self._tenant_access_token
            else:
                logger.error(f"获取tenant_access_token失败: {data}")
                raise Exception(f"获取token失败: {data.get('msg')}")
    
    async def _make_request(
        self,
        method: str,
        endpoint: str,
        data: Optional[Dict] = None,
        params: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """发送API请求"""
        token = await self._get_tenant_access_token()
        
        url = f"https://open.feishu.cn/open-apis{endpoint}"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        
        async with httpx.AsyncClient() as client:
            if method.upper() == "GET":
                response = await client.get(url, headers=headers, params=params)
            elif method.upper() == "POST":
                response = await client.post(url, headers=headers, json=data)
            else:
                raise ValueError(f"不支持的HTTP方法: {method}")
            
            return response.json()
    
    async def get_questions_by_company(self, company_name: str) -> Dict[str, List[str]]:
        """根据公司名称获取对应的访谈问题
        
        Args:
            company_name: 公司核心品牌词（如：小米、字节）
            
        Returns:
            dict: {part1: [...], part2: [...], part3: [...]}
        """
        endpoint = f"/bitable/v1/apps/{self.app_token}/tables/{self.questions_table_id}/records/search"
        
        # 构建筛选条件
        filter_config = {
            "conjunction": "and",
            "conditions": [
                {
                    "field_name": "被调研公司名称",
                    "operator": "is",
                    "value": [company_name]
                }
            ]
        }
        
        try:
            response = await self._make_request(
                "POST",
                endpoint,
                data={
                    "filter": filter_config,
                    "page_size": 1
                }
            )
            
            if response.get("code") != 0:
                logger.error(f"查询问题失败: {response}")
                return self._get_default_questions()
            
            items = response.get("data", {}).get("items", [])
            
            if not items:
                logger.warning(f"未找到公司 {company_name} 的问题，使用默认问题")
                return self._get_default_questions()
            
            record = items[0].get("fields", {})
            
            # 解析问题字段
            part1 = self._parse_questions_field(record.get("part1", ""))
            part2 = self._parse_questions_field(record.get("part2", ""))
            part3 = self._parse_questions_field(record.get("part3", ""))
            
            return {
                "part1": part1,
                "part2": part2,
                "part3": part3
            }
            
        except Exception as e:
            logger.error(f"获取问题出错: {e}")
            return self._get_default_questions()
    
    def _parse_questions_field(self, field_value: Any) -> List[str]:
        """解析问题字段值
        
        字段值可能是：
        - 字符串（多个问题用换行分隔）
        - 列表
        - 富文本对象
        """
        if not field_value:
            return []
        
        if isinstance(field_value, list):
            # 可能是富文本格式
            if field_value and isinstance(field_value[0], dict):
                # 富文本格式
                text = "".join([item.get("text", "") for item in field_value])
                return self._split_questions(text)
            return field_value
        
        if isinstance(field_value, str):
            return self._split_questions(field_value)
        
        return []
    
    def _split_questions(self, text: str) -> List[str]:
        """分割问题文本"""
        # 按换行或数字序号分割
        import re
        
        # 移除开头的数字序号
        lines = text.strip().split("\n")
        questions = []
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            # 移除开头的序号（如 "1." "1、" "1)" 等）
            line = re.sub(r'^[\d]+[.、)）\s]+', '', line)
            if line:
                questions.append(line)
        
        return questions
    
    def _get_default_questions(self) -> Dict[str, List[str]]:
        """返回默认问题集"""
        return {
            "part1": [
                "请问您负责的部门在公司的组织架构中处于什么位置？主要承担哪些职能？",
                "您日常工作中非定期的工作内容有哪些？这些工作大概占用您多少时间？",
                "除了上述工作外，您日常还需要处理哪些临时性或突发性的事务？"
            ],
            "part2": [
                "在跨部门协作中，您遇到过哪些信息不通畅或流程不顺的情况？",
                "目前贵司在使用什么办公协同工具？您觉得有哪些痛点？",
                "如果有一个AI助手能帮您处理日常工作，您最希望它帮您做什么？"
            ],
            "part3": [
                "除了上述问题外，您还有哪些想要补充的内容？"
            ]
        }
    
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
        """保存访谈记录到多维表格
        
        Args:
            session_id: 会话ID
            user_name: 用户姓名
            company: 公司名称
            user_input_summary: 用户输入摘要
            conversation_history: 完整对话记录(JSON字符串)
            skill_name: 命中技能
            status: 执行状态
            token_count: Token消耗
            summary: 访谈分析总结
            
        Returns:
            bool: 是否保存成功
        """
        endpoint = f"/bitable/v1/apps/{self.app_token}/tables/{self.records_table_id}/records"
        
        record_data = {
            "fields": {
                "ID": session_id,
                "用户": user_name,
                "用户输入": user_input_summary,
                "对话记录": conversation_history,
                "命中技能": skill_name,
                "执行状态": status,
                "Token消耗": token_count,
                "访谈分析": summary
            }
        }
        
        try:
            response = await self._make_request("POST", endpoint, data=record_data)
            
            if response.get("code") == 0:
                logger.info(f"访谈记录保存成功: {session_id}")
                return True
            else:
                logger.error(f"保存记录失败: {response}")
                return False
                
        except Exception as e:
            logger.error(f"保存记录出错: {e}")
            return False
    
    async def update_interview_record(
        self,
        record_id: str,
        updates: Dict[str, Any]
    ) -> bool:
        """更新访谈记录
        
        Args:
            record_id: 记录ID
            updates: 要更新的字段
            
        Returns:
            bool: 是否更新成功
        """
        endpoint = f"/bitable/v1/apps/{self.app_token}/tables/{self.records_table_id}/records/{record_id}"
        
        try:
            response = await self._make_request("PUT", endpoint, data={"fields": updates})
            return response.get("code") == 0
        except Exception as e:
            logger.error(f"更新记录出错: {e}")
            return False


# 全局单例
bitable_service = BitableService()




