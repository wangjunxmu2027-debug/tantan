import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, errorResponse } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ADMIN_PASSWORD = Deno.env.get("ADMIN_PASSWORD") || "tantan2024";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * 生成调研主题综合报告
 * 
 * 功能：
 * 1. 接收多个 link_ids 和 theme
 * 2. 查询这些链接下的所有访谈记录
 * 3. 调用 LLM 生成综合分析报告
 * 4. 返回结构化报告
 * 
 * 请求方式：
 * POST /functions/v1/admin-theme-report
 * Header: x-admin-password
 * Body: { "theme": "主题名", "link_ids": ["id1", "id2"] }
 */

interface InterviewSession {
  session_id: string;
  user_info: any;
  summary: string;
  answers: any[];
  token_count: number;
  created_at: string;
}

Deno.serve(async (req: Request) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 验证管理员密码
    const adminPassword = req.headers.get("x-admin-password");
    if (adminPassword !== ADMIN_PASSWORD) {
      return errorResponse("未授权访问", 401);
    }

    const { theme, link_ids } = await req.json();

    if (!theme || !link_ids || !Array.isArray(link_ids) || link_ids.length === 0) {
      return errorResponse("缺少 theme 或 link_ids 参数", 400);
    }

    console.log(`生成综合报告: 主题=${theme}, 链接数=${link_ids.length}`);

    // 1. 查询所有选中链接的访谈会话
    const { data: visits, error: visitsError } = await supabase
      .from("link_visits")
      .select(`
        *,
        interview_sessions (
          session_id,
          stage,
          user_info,
          summary,
          answers,
          token_count,
          created_at
        ),
        interview_links (
          theme,
          company_name,
          interviewer_name
        )
      `)
      .in("link_id", link_ids)
      .eq("completed", true)
      .order("visited_at", { ascending: false });

    if (visitsError) {
      console.error("查询访谈记录失败:", visitsError);
      return errorResponse("查询访谈记录失败");
    }

    // 2. 提取所有已完成的会话
    const sessions: InterviewSession[] = (visits || [])
      .filter(v => v.interview_sessions && v.interview_sessions.stage === "completed")
      .map(v => ({
        session_id: v.session_id,
        user_info: v.interview_sessions.user_info || {},
        summary: v.interview_sessions.summary || "",
        answers: v.interview_sessions.answers || [],
        token_count: v.interview_sessions.token_count || 0,
        created_at: v.interview_sessions.created_at,
        company_name: v.interview_links?.company_name || "",
      }));

    if (sessions.length === 0) {
      return jsonResponse({
        success: false,
        message: `未找到主题"${theme}"的已完成访谈记录`,
        theme,
        link_count: link_ids.length,
        interview_count: 0,
      });
    }

    console.log(`找到 ${sessions.length} 条已完成的访谈记录`);

    // 3. 准备数据给 LLM
    const interviewSummaries = sessions.map((s: any, i: number) => {
      const userName = s.user_info?.full_name || s.user_info?.surname || "未知";
      const company = s.company_name || s.user_info?.company || "未知公司";
      const date = new Date(s.created_at).toLocaleDateString("zh-CN");
      return `### 访谈 ${i + 1}: ${userName} (${company}) - ${date}\n${s.summary || "无总结"}\n`;
    }).join("\n---\n");

    // 4. 调用 LLM 生成综合报告
    const report = await generateThemeReport(theme, sessions.length, interviewSummaries);

    // 5. 返回报告
    return jsonResponse({
      success: true,
      theme,
      link_count: link_ids.length,
      interview_count: sessions.length,
      total_tokens: sessions.reduce((sum: number, s: InterviewSession) => sum + (s.token_count || 0), 0),
      key_findings: report.key_findings,
      pain_points: report.pain_points,
      opportunities: report.opportunities,
      recommendations: report.recommendations,
      summary_report: report.summary_report,
      sessions: sessions.map(s => ({
        user_name: s.user_info?.full_name || s.user_info?.surname,
        company: s.user_info?.company,
        summary: s.summary,
        created_at: s.created_at,
      })),
    });

  } catch (err) {
    console.error("生成综合报告失败:", err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return errorResponse(`生成综合报告失败: ${errorMessage}`);
  }
});

async function generateThemeReport(
  theme: string,
  interviewCount: number,
  interviewSummaries: string
): Promise<{
  key_findings: string[];
  pain_points: string[];
  opportunities: string[];
  recommendations: string[];
  summary_report: string;
}> {
  const apiKey = Deno.env.get("LLM_API_KEY") || "";
  const rawBaseUrl = Deno.env.get("LLM_API_BASE_URL") || "https://api.openai.com/v1";
  const baseUrl = rawBaseUrl.replace(/\/+$/, "");
  const model = Deno.env.get("LLM_MODEL") || "gpt-4o";

  const prompt = `# 任务
你是一位专业的商业分析师。请基于以下 ${theme} 的 ${interviewCount} 份访谈记录，生成一份结构化的综合调研报告。

# 访谈记录汇总
${interviewSummaries}

# 输出要求
请严格按照以下 JSON 格式输出，不要添加任何其他内容：

\`\`\`json
{
  "key_findings": [
    "核心发现1：具体描述",
    "核心发现2：具体描述",
    "核心发现3：具体描述"
  ],
  "pain_points": [
    "痛点1：具体描述和影响",
    "痛点2：具体描述和影响",
    "痛点3：具体描述和影响"
  ],
  "opportunities": [
    "机会点1：具体描述和潜在价值",
    "机会点2：具体描述和潜在价值"
  ],
  "recommendations": [
    "建议1：具体行动方案",
    "建议2：具体行动方案",
    "建议3：具体行动方案"
  ],
  "summary_report": "完整的Markdown格式综合报告，包含：\\n## 1. 调研概况\\n## 2. 核心发现\\n## 3. 痛点分析\\n## 4. 机会洞察\\n## 5. 行动建议\\n## 6. 下一步计划"
}
\`\`\`

# 注意事项
1. key_findings、pain_points、opportunities、recommendations 各包含 3-5 条
2. summary_report 是完整的 Markdown 报告，换行用 \\n 表示
3. 内容要有洞察力，基于访谈数据提炼，不要泛泛而谈
4. 只输出 JSON，不要有其他文字
5. 确保 JSON 格式正确，可以被解析`;

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "你是一位专业的商业分析师，擅长从访谈数据中提取洞察。请严格按照要求的JSON格式输出。",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.5,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("LLM API error:", response.status, errorText);
      throw new Error(`LLM API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // 尝试解析 JSON
    try {
      // 尝试直接解析
      const result = JSON.parse(content);
      return {
        key_findings: result.key_findings || [],
        pain_points: result.pain_points || [],
        opportunities: result.opportunities || [],
        recommendations: result.recommendations || [],
        summary_report: result.summary_report || "",
      };
    } catch {
      // 尝试从响应中提取 JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const result = JSON.parse(jsonMatch[0]);
          return {
            key_findings: result.key_findings || [],
            pain_points: result.pain_points || [],
            opportunities: result.opportunities || [],
            recommendations: result.recommendations || [],
            summary_report: result.summary_report || "",
          };
        } catch {
          // 解析失败
        }
      }
    }

    // 解析失败，返回原始内容作为报告
    return {
      key_findings: ["解析失败，请查看完整报告"],
      pain_points: [],
      opportunities: [],
      recommendations: [],
      summary_report: content,
    };
  } catch (error) {
    console.error("LLM 调用失败:", error);
    // 返回默认报告
    return {
      key_findings: ["综合报告生成失败，请稍后重试"],
      pain_points: [],
      opportunities: [],
      recommendations: [],
      summary_report: `# ${theme} 综合报告\n\n共收集 ${interviewCount} 份访谈记录。\n\n${interviewSummaries}`,
    };
  }
}

