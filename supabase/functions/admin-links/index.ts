import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, errorResponse } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ADMIN_PASSWORD = Deno.env.get("ADMIN_PASSWORD") || "tantan2024";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// 生成短链接代码
function generateLinkCode(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // 验证管理员密码
  const authHeader = req.headers.get("x-admin-password");
  if (authHeader !== ADMIN_PASSWORD) {
    return errorResponse("未授权访问", 401);
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  try {
    // GET - 获取所有链接及统计
    if (req.method === "GET") {
      const { data: links, error } = await supabase
        .from("interview_links")
        .select(`
          *,
          link_visits (
            id,
            session_id,
            visited_at,
            completed,
            completed_at
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // 计算统计数据
      const linksWithStats = (links || []).map((link: any) => {
        const visits = link.link_visits || [];
        const completedVisits = visits.filter((v: any) => v.completed);
        
        return {
          ...link,
          visitCount: visits.length,
          completedCount: completedVisits.length,
          completionRate: visits.length > 0 
            ? Math.round((completedVisits.length / visits.length) * 100) 
            : 0,
          isExpired: link.expires_at && new Date(link.expires_at) < new Date(),
          isMaxUsed: link.max_uses > 0 && link.use_count >= link.max_uses,
        };
      });

      return jsonResponse({
        success: true,
        links: linksWithStats,
      });
    }

    // POST - 创建新链接
    if (req.method === "POST") {
      const body = await req.json();
      const { 
        company_name, 
        interviewer_name,
        purpose, // 访谈目的 
        expires_hours, // 过期小时数
        max_uses,
        batch, // 是否批量创建
        voice // 音色
      } = body;

      // 批量创建
      if (batch && Array.isArray(body.companies)) {
        const linksToCreate = body.companies.map((company: any) => ({
          company_name: company.name || company,
          interviewer_name: company.interviewer || null,
          purpose: company.purpose || null,
          link_code: generateLinkCode(),
          expires_at: expires_hours 
            ? new Date(Date.now() + expires_hours * 60 * 60 * 1000).toISOString()
            : null,
          max_uses: max_uses || 0,
        }));

        const { data, error } = await supabase
          .from("interview_links")
          .insert(linksToCreate)
          .select();

        if (error) throw error;

        return jsonResponse({
          success: true,
          links: data,
          count: data?.length || 0,
        });
      }

      // 单个创建
      if (!company_name) {
        return errorResponse("缺少公司名称", 400);
      }

      const linkCode = generateLinkCode();
      const expiresAt = expires_hours 
        ? new Date(Date.now() + expires_hours * 60 * 60 * 1000).toISOString()
        : null;

      const { data, error } = await supabase
        .from("interview_links")
        .insert({
          company_name,
          interviewer_name: interviewer_name || null,
          purpose: purpose || null,
          link_code: linkCode,
          expires_at: expiresAt,
          max_uses: max_uses || 0,
          voice: voice || 'xinwen',
        })
        .select()
        .single();

      if (error) throw error;

      return jsonResponse({
        success: true,
        link: data,
      });
    }

    // DELETE - 删除链接
    if (req.method === "DELETE") {
      const linkId = url.searchParams.get("id");
      if (!linkId) {
        return errorResponse("缺少链接ID", 400);
      }

      const { error } = await supabase
        .from("interview_links")
        .delete()
        .eq("id", linkId);

      if (error) throw error;

      return jsonResponse({ success: true });
    }

    return errorResponse("不支持的请求方法", 405);

  } catch (err) {
    console.error("链接管理失败:", err);
    return errorResponse(`操作失败: ${err instanceof Error ? err.message : String(err)}`);
  }
});

