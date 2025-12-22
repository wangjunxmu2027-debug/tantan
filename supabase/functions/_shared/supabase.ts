import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export function getSupabaseClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  return createClient(supabaseUrl, supabaseKey);
}

// Interview session types
export interface UserInfo {
  surname?: string;
  full_name?: string;
  company?: string;
  raw_input?: string;
}

export interface QuestionProgress {
  current_part: number;
  current_question_index: number;
  total_parts: number;
}

export interface Questions {
  part1: string[];
  part2: string[];
  part3: string[];
}

export interface Message {
  role: "assistant" | "user";
  content: string;
  timestamp: string;
}

export interface Answer {
  question_id: string;
  question: string;
  answer: string;
  part: number;
}

export interface InterviewSession {
  session_id: string;
  stage: string;
  user_info: UserInfo;
  questions: Questions;
  progress: QuestionProgress;
  history: Message[];
  answers: Answer[];
  summary?: string;
  token_count: number;
  created_at: string;
  updated_at: string;
}

// Get session from database
export async function getSession(supabase: SupabaseClient, sessionId: string): Promise<InterviewSession | null> {
  const { data, error } = await supabase
    .from("interview_sessions")
    .select("*")
    .eq("session_id", sessionId)
    .single();

  if (error || !data) {
    return null;
  }

  return data as InterviewSession;
}

// Update session in database
export async function updateSession(supabase: SupabaseClient, session: Partial<InterviewSession> & { session_id: string }): Promise<boolean> {
  const { error } = await supabase
    .from("interview_sessions")
    .update({
      ...session,
      updated_at: new Date().toISOString(),
    })
    .eq("session_id", session.session_id);

  return !error;
}

// Get questions by company name
export async function getQuestionsByCompany(supabase: SupabaseClient, companyName: string): Promise<Questions> {
  // Try exact match first
  let { data } = await supabase
    .from("questions_cache")
    .select("part1, part2, part3")
    .eq("company_name", companyName)
    .single();

  if (!data) {
    // Fallback to default
    const result = await supabase
      .from("questions_cache")
      .select("part1, part2, part3")
      .eq("company_name", "默认")
      .single();
    data = result.data;
  }

  if (data) {
    return {
      part1: data.part1 || [],
      part2: data.part2 || [],
      part3: data.part3 || [],
    };
  }

  // Hardcoded fallback
  return {
    part1: [
      "请问您负责的部门主要承担哪些职能？",
      "您日常工作中最核心的业务流程有哪些？",
      "目前团队规模大概是多少人？",
      "在日常协作中，您主要使用哪些工具和系统？",
      "您认为当前工作流程中最大的痛点是什么？",
    ],
    part2: [
      "您日常工作中非定期性的临时任务多吗？如何管理？",
      "跨部门协作时，信息传递是否顺畅？",
      "您的团队在知识沉淀方面做得如何？",
      "审批流程的效率如何？有没有优化空间？",
      "您对数字化工具的使用体验如何？",
    ],
    part3: ["除了上述问题外，您还有哪些想要补充的内容？"],
  };
}

