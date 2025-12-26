import axios from "axios";

// API基础URL - 使用 Supabase Edge Functions
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://xvtgrzavwqesdfcifyrq.supabase.co/functions/v1";

// 创建axios实例
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 120000, // 120秒超时（LLM响应可能较慢）
  headers: {
    "Content-Type": "application/json",
  },
});

// 消息类型
export interface Message {
  role: "user" | "assistant";
  content: string;
}

// 创建会话请求参数
export interface CreateSessionParams {
  theme?: string;
  preset_company?: string;
  preset_name?: string;
  link_code?: string;
}

// API响应类型
export interface CreateSessionResponse {
  session_id: string;
  welcome_message: string;
  stage: string;
  preset_company?: string;
  preset_name?: string;
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

// API方法 - 适配 Supabase Edge Functions 路径
export const interviewApi = {
  /**
   * 创建新的访谈会话
   * @param params 可选的预设参数（公司名、访谈者姓名、链接代码）
   */
  async createSession(params?: CreateSessionParams): Promise<CreateSessionResponse> {
    const response = await api.post<CreateSessionResponse>("/interview-create", params || {});
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
    const response = await api.post<SendMessageResponse>("/interview-message", {
      session_id: sessionId,
      content,
      message_type: messageType,
    });
    return response.data;
  },

  /**
   * 获取会话状态
   */
  async getSessionStatus(sessionId: string): Promise<SessionStatus> {
    const response = await api.get<SessionStatus>(
      `/interview-status?session_id=${sessionId}`
    );
    return response.data;
  },

  /**
   * 获取访谈总结
   */
  async getSummary(sessionId: string): Promise<InterviewSummary> {
    const response = await api.get<InterviewSummary>(
      `/interview-summary?session_id=${sessionId}`
    );
    return response.data;
  },

  /**
   * 健康检查 - 通过创建会话接口验证
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Edge Functions 没有专门的健康检查接口，使用 OPTIONS 请求测试
      const response = await api.options("/interview-create");
      return response.status === 200 || response.status === 204;
    } catch {
      return false;
    }
  },
};

export default api;
