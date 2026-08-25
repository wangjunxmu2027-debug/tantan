import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { WELCOME_MESSAGE } from "../_shared/prompts.ts";
import { fetchQuestionsForCompany } from "../_shared/feishu.ts";

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

// 根据不同情况生成欢迎消息
function getWelcomeMessage(theme: string, companyName?: string, interviewerName?: string): string {
  // 情况1: 主题+公司+姓名都确定 → 不应该到这里，会直接开始访谈
  
  // 情况2: 主题+公司确定，姓名未确定 → 只询问姓名
  if (companyName && !interviewerName) {
    return `您好！我是飞书企业访谈助手"探探"🎤。

很高兴与您进行关于 **${companyName}** 的${theme}访谈，预计10余个问题，大约15分钟⌚。

在调研过程中，我会精准记录您提出的业务痛点、功能需求与落地期望。您可以放心，所有信息均会严格保密🔒。

在开始之前，请问您怎么称呼？（例如：王总）`;
  }
  
  // 情况3: 只有主题确定，公司和姓名都未确定 → 询问公司和姓名
  return `您好！我是飞书企业访谈助手"探探"🎤。

很高兴与您进行 **${theme}** 访谈，预计10余个问题，大约15分钟⌚。

在调研过程中，我会精准记录您提出的业务痛点、功能需求与落地期望。您可以放心，所有信息均会严格保密🔒。

在开始之前，需要和您确认一些信息：**请问您所在的公司是哪家？以及您的全名是什么？**

确认您的这些信息便于选取和您更加匹配的调研问题。`;
}

Deno.serve(async (req: Request) => {
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
      purpose,            // 本次访谈目的
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

    // 如果有主题，处理不同场景
    if (theme) {
      console.log("预设模式 - 主题:", theme, "公司:", preset_company || '空', "访谈者:", preset_name || '空');
      // 加载问题库（使用新的逻辑：theme + company）
      try {
        questions = await fetchQuestionsForCompany(theme, preset_company || null, supabase);
        console.log("成功加载问题库:", {
          part1: questions.part1?.length || 0,
          part2: questions.part2?.length || 0,
          part3: questions.part3?.length || 0,
        });
      } catch (e) {
        console.error("加载问题库失败，使用默认:", e);
        questions = await fetchQuestionsForCompany(theme, null, supabase);
      }

      // 提取姓氏用于称呼
      const surname = getSurname(preset_name || "");
      const honorific = getHonorific(preset_name || "");
      
      userInfo = {
        company: preset_company || "",
        surname: surname,
        fullname: preset_name || "",
        honorific: honorific,
      };

      // 判断进入哪个阶段
      if (preset_company && preset_name) {
        // 情况1: 主题+公司+姓名都确定 → 直接开始访谈
        stage = "interview";
        
        if (questions.part1 && questions.part1.length > 0) {
          firstQuestion = questions.part1[0];
          
          // 实时语音模型会在会话就绪后主动开场；这里不再同步等待 LLM，避免专属链接进入页被阻塞数十秒。
          const subject = preset_company ? `关于${preset_company}的${theme}` : theme;
          welcomeMessage = `${honorific}您好！非常感谢您抽出宝贵时间参与本次${subject}调研访谈。\n\n让我们开始第一个问题：\n\n${firstQuestion}`;
        }
      } else if (preset_company && !preset_name) {
        // 情况2: 主题+公司确定，姓名未确定 → 只询问姓名
        stage = "collect_name";
        welcomeMessage = getWelcomeMessage(theme, preset_company);
      } else {
        // 情况3: 只有主题确定 → 询问公司和姓名
        stage = "collect";
        welcomeMessage = getWelcomeMessage(theme);
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
      questions,
      context: {
        theme: theme || "公司调研",
        company_name: preset_company || null,
        interviewer_name: preset_name || null,
        purpose: purpose || null,
      },
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return errorResponse("服务器错误");
  }
});
