import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // Get session_id from URL path
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/");
    const sessionId = pathParts[pathParts.length - 1];

    // Also check query params as fallback
    const sessionIdFromQuery = url.searchParams.get("session_id");
    const finalSessionId = sessionId && sessionId !== "interview-summary" 
      ? sessionId 
      : sessionIdFromQuery;

    if (!finalSessionId) {
      return errorResponse("缺少 session_id", 400);
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get session
    const { data: session, error } = await supabase
      .from("interview_sessions")
      .select("summary, answers, user_info, token_count, stage")
      .eq("session_id", finalSessionId)
      .single();

    if (error || !session) {
      console.error("Session not found:", error);
      return errorResponse("会话不存在", 404);
    }

    return jsonResponse({
      summary: session.summary || "",
      answers: session.answers || [],
      user_info: session.user_info || {},
      token_count: session.token_count || 0,
      stage: session.stage,
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return errorResponse("获取总结失败");
  }
});
