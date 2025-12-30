import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, errorResponse } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ADMIN_PASSWORD = Deno.env.get("ADMIN_PASSWORD") || "tantan2024";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * 获取单个链接的访谈报告
 * 
 * 功能：
 * 1. 根据 link_id 查询该链接的所有访谈会话
 * 2. 统计访谈次数、完成率等信息
 * 3. 返回所有会话的详细信息
 * 
 * 请求方式：
 * GET /functions/v1/admin-link-report?link_id=xxx
 * Header: x-admin-password
 */

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

    // 获取 link_id
    const url = new URL(req.url);
    const linkId = url.searchParams.get("link_id");

    if (!linkId) {
      return errorResponse("缺少 link_id 参数", 400);
    }

    // 1. 获取链接信息
    const { data: link, error: linkError } = await supabase
      .from("interview_links")
      .select("*")
      .eq("id", linkId)
      .single();

    if (linkError || !link) {
      console.error("链接不存在:", linkError);
      return errorResponse("链接不存在", 404);
    }

    // 2. 查询该链接的所有访谈会话
    // 使用 link_visits 关联表来找到所有访问该链接的 session
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
          created_at,
          updated_at
        )
      `)
      .eq("link_id", linkId)
      .order("visited_at", { ascending: false });

    if (visitsError) {
      console.error("查询访谈记录失败:", visitsError);
      return errorResponse("查询访谈记录失败");
    }

    // 3. 处理数据
    const sessions = (visits || [])
      .filter(v => v.interview_sessions)
      .map(v => ({
        session_id: v.session_id,
        ...v.interview_sessions,
        completed: v.completed,
        completed_at: v.completed_at,
        visited_at: v.visited_at,
      }));

    // 4. 统计信息
    const totalVisits = visits?.length || 0;
    const completedSessions = sessions.filter(s => s.completed).length;
    const completionRate = totalVisits > 0 
      ? Math.round((completedSessions / totalVisits) * 100)
      : 0;

    // 5. 返回报告
    return jsonResponse({
      success: true,
      link: {
        id: link.id,
        theme: link.theme,
        company_name: link.company_name,
        interviewer_name: link.interviewer_name,
        purpose: link.purpose,
        link_code: link.link_code,
      },
      interview_count: completedSessions,
      total_visits: totalVisits,
      completion_rate: completionRate,
      sessions: sessions.map(s => ({
        session_id: s.session_id,
        stage: s.stage,
        user_info: s.user_info || {},
        summary: s.summary || "",
        answers: s.answers || [],
        token_count: s.token_count || 0,
        created_at: s.created_at,
        completed: s.completed,
        completed_at: s.completed_at,
      })),
    });

  } catch (err) {
    console.error("获取报告失败:", err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return errorResponse(`获取报告失败: ${errorMessage}`);
  }
});

