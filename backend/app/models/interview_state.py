"""
访谈状态数据模型
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from enum import Enum
from datetime import datetime
import uuid


class InterviewStage(str, Enum):
    """访谈阶段枚举"""
    WELCOME = "welcome"          # 开场
    COLLECT = "collect"          # 信息收集
    RETRIEVE = "retrieve"        # 问题检索
    INTERVIEW = "interview"      # 多轮访谈
    THANKS = "thanks"            # 感谢结束
    SUMMARY = "summary"          # 总结分析
    COMPLETED = "completed"      # 已完成


class UserInfo(BaseModel):
    """用户信息"""
    surname: Optional[str] = None
    full_name: Optional[str] = None
    company: Optional[str] = None
    raw_input: Optional[str] = None


class QuestionProgress(BaseModel):
    """问题进度"""
    current_part: int = 1  # 1, 2, 3, 4 (4=感谢)
    current_question_index: int = 0
    total_parts: int = 3


class Message(BaseModel):
    """消息记录"""
    role: str  # "assistant" | "user"
    content: str
    timestamp: datetime = Field(default_factory=datetime.now)


class Answer(BaseModel):
    """问题回答记录"""
    question_id: str
    question: str
    answer: str
    follow_up: Optional[str] = None
    part: int = 1


class InterviewQuestions(BaseModel):
    """访谈问题集"""
    part1: List[str] = []
    part2: List[str] = []
    part3: List[str] = []


class InterviewState(BaseModel):
    """完整的访谈状态"""
    session_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    stage: InterviewStage = InterviewStage.WELCOME
    user: UserInfo = Field(default_factory=UserInfo)
    questions: InterviewQuestions = Field(default_factory=InterviewQuestions)
    progress: QuestionProgress = Field(default_factory=QuestionProgress)
    history: List[Message] = []
    answers: List[Answer] = []
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    summary: Optional[str] = None
    token_count: int = 0
    
    def add_message(self, role: str, content: str):
        """添加消息到历史"""
        self.history.append(Message(role=role, content=content))
        self.updated_at = datetime.now()
    
    def add_answer(self, question_id: str, question: str, answer: str, part: int):
        """记录回答"""
        self.answers.append(Answer(
            question_id=question_id,
            question=question,
            answer=answer,
            part=part
        ))
    
    def get_current_question(self) -> Optional[str]:
        """获取当前问题"""
        part = self.progress.current_part
        idx = self.progress.current_question_index
        
        if part == 1 and idx < len(self.questions.part1):
            return self.questions.part1[idx]
        elif part == 2 and idx < len(self.questions.part2):
            return self.questions.part2[idx]
        elif part == 3 and idx < len(self.questions.part3):
            return self.questions.part3[idx]
        return None
    
    def advance_progress(self) -> bool:
        """推进问题进度，返回是否还有下一个问题"""
        part = self.progress.current_part
        idx = self.progress.current_question_index
        
        # 获取当前Part的问题列表
        current_questions = []
        if part == 1:
            current_questions = self.questions.part1
        elif part == 2:
            current_questions = self.questions.part2
        elif part == 3:
            current_questions = self.questions.part3
        
        # 尝试推进到下一个问题
        if idx + 1 < len(current_questions):
            self.progress.current_question_index = idx + 1
            return True
        
        # 当前Part完成，尝试切换到下一个Part
        if part < 3:
            self.progress.current_part = part + 1
            self.progress.current_question_index = 0
            return True
        
        # 所有问题完成
        self.progress.current_part = 4
        return False
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典（用于JSON序列化）"""
        return {
            "session_id": self.session_id,
            "stage": self.stage.value,
            "user": self.user.model_dump(),
            "questions": self.questions.model_dump(),
            "progress": self.progress.model_dump(),
            "history": [{"role": m.role, "content": m.content, "timestamp": m.timestamp.isoformat()} for m in self.history],
            "answers": [a.model_dump() for a in self.answers],
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "summary": self.summary,
            "token_count": self.token_count
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "InterviewState":
        """从字典创建实例"""
        data["stage"] = InterviewStage(data["stage"])
        data["user"] = UserInfo(**data["user"])
        data["questions"] = InterviewQuestions(**data["questions"])
        data["progress"] = QuestionProgress(**data["progress"])
        data["history"] = [Message(**m) for m in data["history"]]
        data["answers"] = [Answer(**a) for a in data["answers"]]
        data["created_at"] = datetime.fromisoformat(data["created_at"])
        data["updated_at"] = datetime.fromisoformat(data["updated_at"])
        return cls(**data)


# API请求/响应模型
class CreateSessionResponse(BaseModel):
    """创建会话响应"""
    session_id: str
    welcome_message: str
    stage: str


class SendMessageRequest(BaseModel):
    """发送消息请求"""
    session_id: str
    content: str
    message_type: str = "text"  # "text" | "voice"


class SendMessageResponse(BaseModel):
    """发送消息响应"""
    reply: str
    stage: str
    progress: Optional[Dict[str, Any]] = None
    is_completed: bool = False


class VoiceUploadResponse(BaseModel):
    """语音上传响应"""
    transcription: str
    reply: str
    stage: str


class InterviewSummaryResponse(BaseModel):
    """访谈总结响应"""
    summary: str
    answers: List[Dict[str, Any]]
    user_info: Dict[str, Any]


