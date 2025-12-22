import axios from "axios";

// API基础URL
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// 创建axios实例
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000, // 60秒超时（LLM响应可能较慢）
  headers: {
    "Content-Type": "application/json",
  },
});

// 消息类型
export interface Message {
  role: "user" | "assistant";
  content: string;
}

// API响应类型
export interface CreateSessionResponse {
  session_id: string;
  welcome_message: string;
  stage: string;
}

export interface SendMessageResponse {
  reply: string;
  stage: string;
  progress?: {
    current_part: number;
    current_question_index: number;
    total_parts: number;
  };
  is_completed: boolean;
}

export interface SessionStatus {
  session_id: string;
  stage: string;
  progress: {
    current_part: number;
    current_question_index: number;
    total_parts: number;
  };
  user: {
    surname: string | null;
    full_name: string | null;
    company: string | null;
  };
  message_count: number;
  answer_count: number;
  token_count: number;
}

export interface InterviewSummary {
  summary: string;
  answers: Array<{
    question_id: string;
    question: string;
    answer: string;
    part: number;
  }>;
  user_info: {
    surname: string | null;
    full_name: string | null;
    company: string | null;
  };
}

// API方法
export const interviewApi = {
  /**
   * 创建新的访谈会话
   */
  async createSession(): Promise<CreateSessionResponse> {
    const response = await api.post<CreateSessionResponse>(
      "/api/interview/create"
    );
    return response.data;
  },

  /**
   * 发送消息
   */
  async sendMessage(
    sessionId: string,
    content: string,
    messageType: "text" | "voice" = "text"
  ): Promise<SendMessageResponse> {
    const response = await api.post<SendMessageResponse>(
      "/api/interview/message",
      {
        session_id: sessionId,
        content,
        message_type: messageType,
      }
    );
    return response.data;
  },

  /**
   * 获取会话状态
   */
  async getSessionStatus(sessionId: string): Promise<SessionStatus> {
    const response = await api.get<SessionStatus>(
      `/api/interview/${sessionId}/status`
    );
    return response.data;
  },

  /**
   * 获取访谈总结
   */
  async getSummary(sessionId: string): Promise<InterviewSummary> {
    const response = await api.get<InterviewSummary>(
      `/api/interview/${sessionId}/summary`
    );
    return response.data;
  },

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await api.get("/health");
      return response.data.status === "healthy";
    } catch {
      return false;
    }
  },
};

export default api;


