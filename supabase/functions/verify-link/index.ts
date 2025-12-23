import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, errorResponse } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { link_code, session_id } = await req.json();

    if (!link_code) {
      return errorResponse("缺少链接代码", 400);
    }

    // 查找链接
    const { data: link, error } = await supabase
      .from("interview_links")
      .select("*")
      .eq("link_code", link_code)
      .single();

    if (error || !link) {
      return jsonResponse({
        valid: false,
        reason: "链接不存在或已失效",
      });
    }

    // 检查是否过期
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return jsonResponse({
        valid: false,
        reason: "链接已过期",
      });
    }

    // 检查使用次数
    if (link.max_uses > 0 && link.use_count >= link.max_uses) {
      return jsonResponse({
        valid: false,
        reason: "链接已达到最大使用次数",
      });
    }

    // 记录访问
    if (session_id) {
      // 增加使用次数
      await supabase
        .from("interview_links")
        .update({ use_count: link.use_count + 1 })
        .eq("id", link.id);

      // 记录访问
      await supabase
        .from("link_visits")
        .insert({
          link_id: link.id,
          session_id,
          visited_at: new Date().toISOString(),
        });
    }

    return jsonResponse({
      valid: true,
      company_name: link.company_name,
      interviewer_name: link.interviewer_name,
      link_id: link.id,
    });

  } catch (err) {
    console.error("验证链接失败:", err);
    return errorResponse(`验证失败: ${err instanceof Error ? err.message : String(err)}`);
  }
});

