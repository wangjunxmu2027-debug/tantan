"""
总结分析Prompt - 用于生成访谈分析报告
"""

SUMMARY_PROMPT = """# 任务
基于以下访谈记录，生成结构化的访谈分析报告。

# 访谈对象
- 姓名: {full_name}
- 公司: {company}
- 访谈时间: {interview_time}

# 完整问答记录
{formatted_qa_list}

# 输出要求
请生成以下结构的分析报告，使用Markdown格式：

## 1. 访谈概要
- 简要总结本次访谈的主要内容和被访者的核心关注点

## 2. 关键发现
列出3-5个核心业务痛点或需求：
- 痛点1: xxx
- 痛点2: xxx
- ...

## 3. 工作优先级矩阵
基于被访者的回答，分析各项工作的频率和工作量：

| 工作项 | 频率评分 | 工作量评分 | 关键洞察 |
|-------|---------|-----------|---------|
| xxx   | x/5     | x/5       | xxx     |

## 4. 与Leader分工期望
总结用户对工作分工的期望模式：
- 希望自主负责的工作：xxx
- 希望Leader支持的工作：xxx
- 期望的协作模式：xxx

## 5. 潜在机会点
基于访谈内容，推断可能的合作切入点或产品推荐方向：
- 机会1: xxx
- 机会2: xxx

## 6. 后续建议
3条具体的跟进建议：
1. xxx
2. xxx
3. xxx

## 7. 风险提示
如有需要特别注意的事项或潜在风险：
- xxx

---
*本报告由AI调研助手-探探自动生成*
"""


def get_summary_prompt(
    full_name: str,
    company: str,
    interview_time: str,
    qa_list: list
) -> str:
    """获取总结分析prompt"""
    
    # 格式化问答列表
    formatted_qa = []
    for i, qa in enumerate(qa_list, 1):
        formatted_qa.append(f"### 问题{i} (Part{qa.get('part', '?')})")
        formatted_qa.append(f"**问**: {qa.get('question', 'N/A')}")
        formatted_qa.append(f"**答**: {qa.get('answer', 'N/A')}")
        formatted_qa.append("")
    
    formatted_qa_str = "\n".join(formatted_qa) if formatted_qa else "（无问答记录）"
    
    return SUMMARY_PROMPT.format(
        full_name=full_name or "未知",
        company=company or "未知",
        interview_time=interview_time or "未知",
        formatted_qa_list=formatted_qa_str
    )


