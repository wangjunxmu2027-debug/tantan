import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import {
  extractUserInfo,
  generateInterviewStart,
  generateInterviewResponse,
  generateThanks,
  generateSummary,
} from "../_shared/llm.ts";
import {
  queryQuestionsFromFeishu,
  saveInterviewRecord,
} from "../_shared/feishu.ts";

// Interview stages
type Stage =
  | "welcome"
  | "collect"
  | "retrieve"
  | "interview"
  | "thanks"
  | "summary"
  | "completed";

interface SessionData {
  session_id: string;
  stage: Stage;
  user_info: {
    surname?: string;
    full_name?: string;
    company?: string;
    raw_input?: string;
  };
  questions: {
    part1: string[];
    part2: string[];
    part3: string[];
  };
  progress: {
    current_part: number;
    current_question_index: number;
    total_parts: number;
  };
  history: Array<{ role: string; content: string; timestamp: string }>;
  answers: Array<{
    question_id: string;
    question: string;
    answer: string;
    part: number;
  }>;
  token_count: number;
  summary?: string;
}

// Get current question based on progress
function getCurrentQuestion(session: SessionData): string | null {
  const { current_part: part, current_question_index: idx } = session.progress;
  const { questions } = session;

  if (part === 1 && idx < questions.part1.length) {
    return questions.part1[idx];
  } else if (part === 2 && idx < questions.part2.length) {
    return questions.part2[idx];
  } else if (part === 3 && idx < questions.part3.length) {
    return questions.part3[idx];
  }
  return null;
}

// Advance to next question
function advanceProgress(session: SessionData): boolean {
  const { current_part: part, current_question_index: idx } = session.progress;
  const { questions } = session;

  let currentQuestions: string[] = [];
  if (part === 1) currentQuestions = questions.part1;
  else if (part === 2) currentQuestions = questions.part2;
  else if (part === 3) currentQuestions = questions.part3;

  if (idx + 1 < currentQuestions.length) {
    session.progress.current_question_index = idx + 1;
    return true;
  }

  if (part < 3) {
    session.progress.current_part = part + 1;
    session.progress.current_question_index = 0;
    return true;
  }

  session.progress.current_part = 4;
  return false;
}

// Get questions with fallback: Supabase cache -> Feishu API -> Default
async function getQuestionsForCompany(
  supabase: ReturnType<typeof createClient>,
  companyName: string
): Promise<{ part1: string[]; part2: string[]; part3: string[] }> {
  // 1. 先查 Supabase 缓存
  const { data: cachedData } = await supabase
    .from("questions_cache")
    .select("*")
    .eq("company_name", companyName)
    .single();

  if (cachedData) {
    console.log(`缓存命中: ${companyName}`);
    return {
      part1: cachedData.part1 || [],
      part2: cachedData.part2 || [],
      part3: cachedData.part3 || [],
    };
  }

  // 2. 缓存未命中，查询飞书多维表格
  console.log(`缓存未命中，查询飞书: ${companyName}`);
  const feishuResult = await queryQuestionsFromFeishu(companyName);

  if (feishuResult) {
    // 写入缓存
    await supabase.from("questions_cache").upsert({
      company_name: companyName,
      part1: feishuResult.part1,
      part2: feishuResult.part2,
      part3: feishuResult.part3,
      updated_at: new Date().toISOString(),
    });
    console.log(`已缓存 ${companyName} 的问题`);
    return feishuResult;
  }

  // 3. 查询"默认"配置
  const { data: defaultCached } = await supabase
    .from("questions_cache")
    .select("*")
    .eq("company_name", "默认")
    .single();

  if (defaultCached) {
    console.log("使用缓存的默认配置");
    return {
      part1: defaultCached.part1 || [],
      part2: defaultCached.part2 || [],
      part3: defaultCached.part3 || [],
    };
  }

  // 4. 尝试从飞书查询默认配置
  const defaultFeishu = await queryQuestionsFromFeishu("默认");
  if (defaultFeishu) {
    await supabase.from("questions_cache").upsert({
      company_name: "默认",
      part1: defaultFeishu.part1,
      part2: defaultFeishu.part2,
      part3: defaultFeishu.part3,
      updated_at: new Date().toISOString(),
    });
    return defaultFeishu;
  }

  // 5. 硬编码兜底
  console.log("使用硬编码默认问题");
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

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const { session_id, content } = await req.json();

    if (!session_id || !content) {
      return errorResponse("缺少 session_id 或 content", 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get session
    const { data: session, error: fetchError } = await supabase
      .from("interview_sessions")
      .select("*")
      .eq("session_id", session_id)
      .single();

    if (fetchError || !session) {
      console.error("Session not found:", fetchError);
      return errorResponse("会话不存在", 404);
    }

    const sessionData = session as SessionData;
    const now = new Date().toISOString();

    // Add user message to history
    sessionData.history.push({ role: "user", content, timestamp: now });

    let reply = "";

    // Handle based on current stage
    if (sessionData.stage === "collect") {
      // Extract user info
      const info = await extractUserInfo(content);
      sessionData.token_count += info.tokensUsed;

      sessionData.user_info = {
        company: info.company || undefined,
        surname: info.surname || undefined,
        full_name: info.fullName || undefined,
        raw_input: content,
      };

      if (info.confidence < 0.5 || !info.company || !info.surname) {
        reply =
          "抱歉，我没有完全理解您的信息。能否请您再说一下您的**姓名**和**公司名称**？例如：'我是小米的王俊'";
      } else {
        // Get questions (cache -> Feishu -> default)
        const questions = await getQuestionsForCompany(supabase, info.company);

        // 确保所有问题数组都存在
        sessionData.questions = {
          part1: questions.part1 || [],
          part2: questions.part2 || [],
          part3: questions.part3 || [],
        };
        sessionData.stage = "interview";
        sessionData.progress = {
          current_part: 1,
          current_question_index: 0,
          total_parts: 3,
        };

        // Generate interview start
        const startResponse = await generateInterviewStart(
          info.surname!,
          info.company!,
          questions.part1,
          questions.part2,
          questions.part3
        );
        reply = startResponse.content;
        sessionData.token_count += startResponse.tokensUsed;
      }
    } else if (sessionData.stage === "interview") {
      // Check if user wants to end
      const endKeywords = [
        "结束",
        "跳过所有",
        "跳过剩下",
        "没时间",
        "时间有限",
        "不想回答了",
        "就到这里",
        "结束吧",
        "停止访谈",
      ];
      const userWantsToEnd = endKeywords.some((kw) => content.includes(kw));

      // Record current answer
      const currentQuestion = getCurrentQuestion(sessionData);
      if (currentQuestion) {
        const questionId = `part${sessionData.progress.current_part}_q${sessionData.progress.current_question_index}`;
        sessionData.answers.push({
          question_id: questionId,
          question: currentQuestion,
          answer: content,
          part: sessionData.progress.current_part,
        });
      }

      if (userWantsToEnd) {
        sessionData.stage = "thanks";
        const thanksResponse = await generateThanks(
          sessionData.user_info.surname || "您"
        );
        reply = thanksResponse.content;
        sessionData.token_count += thanksResponse.tokensUsed;

        // Generate summary and save to Feishu
        await generateAndSaveSummary(supabase, sessionData);
        sessionData.stage = "completed";
      } else {
        const hasMore = advanceProgress(sessionData);

        if (!hasMore) {
          sessionData.stage = "thanks";
          const thanksResponse = await generateThanks(
            sessionData.user_info.surname || "您"
          );
          reply = thanksResponse.content;
          sessionData.token_count += thanksResponse.tokensUsed;

          // Generate summary and save to Feishu
          await generateAndSaveSummary(supabase, sessionData);
          sessionData.stage = "completed";
        } else {
          const nextQuestion = getCurrentQuestion(sessionData);
          const historyForLLM = sessionData.history.map((h) => ({
            role: h.role,
            content: h.content,
          }));

          const response = await generateInterviewResponse(
            sessionData.user_info.surname || "",
            sessionData.user_info.company || "",
            sessionData.progress.current_part,
            sessionData.progress.current_question_index,
            sessionData.questions.part1,
            sessionData.questions.part2,
            sessionData.questions.part3,
            nextQuestion || "",
            historyForLLM,
            content
          );
          reply = response.content;
          sessionData.token_count += response.tokensUsed;
        }
      }
    } else if (
      sessionData.stage === "thanks" ||
      sessionData.stage === "completed"
    ) {
        reply = "访谈已结束，感谢您的参与！如需重新开始，请刷新页面。";
      sessionData.stage = "completed";
    } else {
        reply = "抱歉，系统出现了一些问题，请稍后重试。";
    }

    // Add assistant reply to history
    sessionData.history.push({
      role: "assistant",
      content: reply,
      timestamp: new Date().toISOString(),
    });

    // Update session in database
    const { error: updateError } = await supabase
      .from("interview_sessions")
      .update({
        stage: sessionData.stage,
        user_info: sessionData.user_info,
        questions: sessionData.questions,
        progress: sessionData.progress,
        history: sessionData.history,
        answers: sessionData.answers,
        token_count: sessionData.token_count,
        summary: sessionData.summary,
        updated_at: new Date().toISOString(),
      })
      .eq("session_id", session_id);

    if (updateError) {
      console.error("Error updating session:", updateError);
    }

    return jsonResponse({
      reply,
      stage: sessionData.stage,
      progress: sessionData.progress,
      is_completed: sessionData.stage === "completed",
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return errorResponse(`处理消息失败: ${errorMessage}`);
  }
});

// Generate summary and save to both Supabase and Feishu
async function generateAndSaveSummary(
  supabase: ReturnType<typeof createClient>,
  session: SessionData
) {
  try {
    const qaList = session.answers.map((a) => ({
      question: a.question,
      answer: a.answer,
      part: a.part,
    }));

    const summaryResponse = await generateSummary(
      session.user_info.full_name || session.user_info.surname || "",
      session.user_info.company || "",
      new Date().toISOString(),
      qaList
    );

    session.summary = summaryResponse.content;
    session.token_count += summaryResponse.tokensUsed;

    // 保存到飞书多维表格
    const conversationJson = JSON.stringify(
      session.history.map((h) => ({ role: h.role, content: h.content }))
    );

    await saveInterviewRecord({
      sessionId: session.session_id,
      userName: session.user_info.full_name || session.user_info.surname || "未知",
      company: session.user_info.company || "未知",
      conversationHistory: conversationJson,
      status: "对话成功",
      tokenCount: session.token_count,
      summary: session.summary,
    });

    console.log(`访谈总结已生成并保存: ${session.session_id}`);
  } catch (err) {
    console.error("Error generating/saving summary:", err);
  }
}
