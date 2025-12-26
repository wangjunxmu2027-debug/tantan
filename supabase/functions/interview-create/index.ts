import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { WELCOME_MESSAGE, getInterviewStartPrompt } from "../_shared/prompts.ts";
import { fetchQuestionsForCompany } from "../_shared/feishu.ts";
import { callLLM } from "../_shared/llm.ts";

// 从全名提取姓氏
function getSurname(fullName: string): string {
  if (!fullName) return "";
  // 中文姓名：取第一个字
  // 常见复姓列表
  const compoundSurnames = ["欧阳", "司马", "上官", "诸葛", "东方", "皇甫", "令狐", "公孙", "慕容", "司徒"];
  for (const surname of compoundSurnames) {
    if (fullName.startsWith(surname)) {
      return surname;
    }
  }
  // 普通单字姓
  return fullName.charAt(0);
}

// 获取尊称（姓氏+总）
function getHonorific(fullName: string): string {
  const surname = getSurname(fullName);
  return surname ? `${surname}总` : "您";
}

// 预设公司的欢迎消息
function getPresetWelcomeMessage(theme: string, companyName?: string, interviewerName?: string): string {
  const honorific = interviewerName ? getHonorific(interviewerName) : "";
  const greeting = honorific 
    ? `${honorific}您好！`
    : `您好！`;
  
  // 根据是否有公司名称，调整访谈主题描述
  const subject = companyName 
    ? `关于 **${companyName}** 的${theme}` 
    : `**${theme}**`;
    
  return `${greeting}我是飞书企业访谈助手"探探"🎤。

很高兴与您进行${subject}访谈，预计10余个问题，大约15分钟⌚。

在调研过程中，我会精准记录您提出的业务痛点、功能需求与落地期望。您可以放心，所有信息均会严格保密🔒。

${honorific ? '准备好后，我们就开始正式访谈吧！' : '在开始之前，请问您怎么称呼？（例如：王总）'}`;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // 解析请求体
    const body = await req.json().catch(() => ({}));
    const { 
      preset_company,      // 预设公司名称
      preset_name,         // 预设访谈者姓名
      link_code,           // 链接代码（用于统计）
      theme,              // 调研主题
    } = body;

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date().toISOString();
    let stage = "collect";
    let welcomeMessage = WELCOME_MESSAGE;
    let questions = { part1: [], part2: [], part3: [] };
    let userInfo: any = {};
    let firstQuestion = "";

    // 如果有预设公司或主题，直接加载问题并跳过收集阶段
    if (preset_company || theme) {
      console.log("预设模式 - 主题:", theme, "公司:", preset_company, "访谈者:", preset_name);
      
      // 加载问题库
      try {
        // 优先使用公司名+主题查询，如果没有公司就只用主题
        const companyKey = preset_company || theme || "默认";
        questions = await fetchQuestionsForCompany(theme || "公司调研", companyKey, supabase);
        console.log("成功加载问题库:", {
          part1: questions.part1?.length || 0,
          part2: questions.part2?.length || 0,
          part3: questions.part3?.length || 0,
        });
      } catch (e) {
        console.error("加载问题库失败，使用默认:", e);
        questions = await fetchQuestionsForCompany(theme || "公司调研", "默认", supabase);
      }

      // 提取姓氏用于称呼
      const surname = getSurname(preset_name || "");
      const honorific = getHonorific(preset_name || "");
      
      userInfo = {
        company: preset_company,
        surname: surname,
        fullname: preset_name || "",
        honorific: honorific,
      };

      // 如果有预设姓名，直接进入访谈阶段
      if (preset_name) {
        stage = "interview";
        
        // 生成第一个问题
        if (questions.part1 && questions.part1.length > 0) {
          firstQuestion = questions.part1[0];
          
          // 使用 LLM 生成自然的开场
          try {
            const prompt = getInterviewStartPrompt(
              surname, // 传递姓氏而非完整用户信息对象
              preset_company,
              questions.part1,
              questions.part2,
              questions.part3
            );
            const llmResponse = await callLLM(prompt);
            welcomeMessage = llmResponse;
          } catch (e) {
            console.error("LLM 生成失败，使用模板:", e);
            welcomeMessage = `${honorific}您好！非常感谢您抽出宝贵时间参与本次关于${preset_company}的调研访谈。\n\n让我们开始第一个问题：\n\n${firstQuestion}`;
          }
        }
      } else {
        // 没有预设姓名，需要先确认姓名
        stage = "collect_name";
        welcomeMessage = getPresetWelcomeMessage(theme || "公司调研", preset_company);
      }
    }

    // Create new session
    const { data, error } = await supabase
      .from("interview_sessions")
      .insert({
        stage,
        theme: theme || "公司调研",
        user_info: userInfo,
        questions,
        progress: { current_part: 1, current_question_index: 0, total_parts: 3 },
        history: [
          { role: "assistant", content: welcomeMessage, timestamp: now },
        ],
        answers: [],
        token_count: 0,
        link_code: link_code || null, // 记录链接代码用于统计
      })
      .select("session_id")
      .single();

    if (error) {
      console.error("Error creating session:", error);
      return errorResponse("创建会话失败");
    }

    // 如果有链接代码，记录访问
    if (link_code) {
      try {
        // 查找链接
        const { data: linkData } = await supabase
          .from("interview_links")
          .select("id, use_count")
          .eq("link_code", link_code)
          .single();

        if (linkData) {
          // 更新使用次数
          await supabase
            .from("interview_links")
            .update({ use_count: linkData.use_count + 1 })
            .eq("id", linkData.id);

          // 记录访问
          await supabase
            .from("link_visits")
            .insert({
              link_id: linkData.id,
              session_id: data.session_id,
              visited_at: now,
            });
        }
      } catch (e) {
        console.error("记录链接访问失败:", e);
      }
    }

    return jsonResponse({
      session_id: data.session_id,
      welcome_message: welcomeMessage,
      stage,
      preset_company: preset_company || null,
      preset_name: preset_name || null,
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return errorResponse("服务器错误");
  }
});
