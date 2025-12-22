import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";

/**
 * 公司调研汇总报告生成函数
 * 
 * 功能：
 * 1. 接收公司名称
 * 2. 查询该公司所有访谈记录
 * 3. 调用 LLM 生成汇总分析
 * 4. 返回结构化报告并保存到数据库
 * 
 * 请求方式：
 * POST /functions/v1/company-report
 * Body: { "company": "公司名称" }
 */

interface InterviewSession {
  session_id: string;
  user_info: {
    surname?: string;
    full_name?: string;
    company?: string;
  };
  answers: Array<{
    question: string;
    answer: string;
    part: number;
  }>;
  summary: string;
  token_count: number;
  created_at: string;
}

interface CompanyReport {
  company_name: string;
  interview_count: number;
  total_tokens: number;
  last_interview_at: string;
  key_findings: string[];
  pain_points: string[];
  opportunities: string[];
  recommendations: string[];
  summary_report: string;
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const { company } = await req.json();

    if (!company) {
      return errorResponse("缺少 company 参数", 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. 查询该公司所有已完成的访谈记录
    // 使用 RPC 或原生查询来处理 JSONB 字段
    const { data: sessions, error: queryError } = await supabase
      .from("interview_sessions")
      .select("*")
      .eq("stage", "completed")
      .order("created_at", { ascending: false });

    // 在应用层过滤公司
    const filteredSessions = (sessions || []).filter(
      (s: InterviewSession) => s.user_info?.company === company
    );

    if (queryError) {
      console.error("查询访谈记录失败:", queryError);
      return errorResponse("查询访谈记录失败");
    }

    if (!filteredSessions || filteredSessions.length === 0) {
      return jsonResponse({
        success: false,
        message: `未找到公司 "${company}" 的访谈记录`,
        company,
        interview_count: 0,
      });
    }

    console.log(`找到 ${filteredSessions.length} 条 ${company} 的访谈记录`);

    // 2. 准备数据给 LLM
    const interviewSummaries = filteredSessions.map((s: InterviewSession, i: number) => {
      const userName = s.user_info?.full_name || s.user_info?.surname || "未知";
      const date = new Date(s.created_at).toLocaleDateString("zh-CN");
      return `### 访谈 ${i + 1}: ${userName} (${date})\n${s.summary || "无总结"}\n`;
    }).join("\n---\n");

    // 3. 调用 LLM 生成汇总分析
    const report = await generateCompanyReport(company, filteredSessions.length, interviewSummaries);

    // 4. 保存到数据库
    const reportData: CompanyReport = {
      company_name: company,
      interview_count: filteredSessions.length,
      total_tokens: filteredSessions.reduce((sum: number, s: InterviewSession) => sum + (s.token_count || 0), 0),
      last_interview_at: filteredSessions[0]?.created_at || new Date().toISOString(),
      key_findings: report.key_findings,
      pain_points: report.pain_points,
      opportunities: report.opportunities,
      recommendations: report.recommendations,
      summary_report: report.summary_report,
    };

    const { error: upsertError } = await supabase
      .from("company_reports")
      .upsert({
        ...reportData,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "company_name",
      });

    if (upsertError) {
      console.error("保存报告失败:", upsertError);
    } else {
      console.log(`已保存 ${company} 的汇总报告到 Supabase`);
    }

    // 5. 写入飞书多维表格
    const feishuWebhookUrl = Deno.env.get("WEBHOOK_COMPANY_REPORT_URL") || 
      "https://yiccsxsc6wk.feishu.cn/base/automation/webhook/event/UrNJaLvI7wmPDyhcaFIce07Kndc";
    
    const feishuSuccess = await saveToFeishu(feishuWebhookUrl, {
      公司名称: company,
      受访企业规模: report.company_scale || "未知",
      访谈次数: filteredSessions.length,
      Token消耗: reportData.total_tokens,
      最近访谈时间: new Date(reportData.last_interview_at).toISOString().split('T')[0],
      核心发现: report.key_findings.join("\n"),
      痛点汇总: report.pain_points.join("\n"),
      机会点: report.opportunities.join("\n"),
      建议方案: report.recommendations.join("\n"),
      汇总报告: report.summary_report,
      更新时间: new Date().toISOString().replace('T', ' ').substring(0, 19),
    });

    return jsonResponse({
      success: true,
      feishu_synced: feishuSuccess,
      ...reportData,
    });

  } catch (err) {
    console.error("生成报告失败:", err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return errorResponse(`生成报告失败: ${errorMessage}`);
  }
});

async function saveToFeishu(webhookUrl: string, data: Record<string, unknown>): Promise<boolean> {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (response.ok) {
      console.log("已同步到飞书多维表格");
      return true;
    } else {
      console.error("同步到飞书失败:", response.status);
      return false;
    }
  } catch (err) {
    console.error("同步到飞书出错:", err);
    return false;
  }
}

async function generateCompanyReport(
  company: string,
  interviewCount: number,
  interviewSummaries: string
): Promise<{
  company_scale: string;
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
你是一位专业的商业分析师。请基于以下 ${company} 公司的 ${interviewCount} 份访谈记录，生成一份结构化的公司调研汇总报告。

# 访谈记录汇总
${interviewSummaries}

# 输出要求
请严格按照以下 JSON 格式输出，不要添加任何其他内容：

\`\`\`json
{
  "company_scale": "企业规模，从以下选项中选择：5人以下 / 5-15人 / 15-50人 / 50人以上",
  "key_findings": [
    "核心发现1",
    "核心发现2",
    "核心发现3"
  ],
  "pain_points": [
    "痛点1：描述",
    "痛点2：描述",
    "痛点3：描述"
  ],
  "opportunities": [
    "机会点1：描述",
    "机会点2：描述"
  ],
  "recommendations": [
    "建议1：具体行动建议",
    "建议2：具体行动建议",
    "建议3：具体行动建议"
  ],
  "summary_report": "完整的Markdown格式汇总报告，包含：\\n## 1. 公司概况\\n## 2. 核心发现\\n## 3. 痛点分析\\n## 4. 机会点\\n## 5. 建议方案\\n## 6. 风险提示"
}
\`\`\`

# 注意事项
1. company_scale 根据访谈内容推断，如无法确定则填"未知"
2. key_findings、pain_points、opportunities、recommendations 各包含 3-5 条
3. summary_report 是完整的 Markdown 报告，换行用 \\n 表示
4. 内容要有洞察力，不要泛泛而谈
5. 只输出 JSON，不要有其他文字`;

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

  const responseText = await response.text();
  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error("LLM 响应解析失败");
  }

  const content = data.choices?.[0]?.message?.content || "";
  
  // 尝试解析 JSON
  try {
    // 尝试直接解析
    const result = JSON.parse(content);
    return {
      company_scale: result.company_scale || "未知",
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
          company_scale: result.company_scale || "未知",
          key_findings: result.key_findings || [],
          pain_points: result.pain_points || [],
          opportunities: result.opportunities || [],
          recommendations: result.recommendations || [],
          summary_report: result.summary_report || "",
        };
      } catch {
        // 解析失败，返回默认结构
      }
    }
  }

  // 解析失败，返回原始内容作为报告
  return {
    company_scale: "未知",
    key_findings: ["解析失败，请查看完整报告"],
    pain_points: [],
    opportunities: [],
    recommendations: [],
    summary_report: content,
  };
}

