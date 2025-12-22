import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { WELCOME_MESSAGE } from "../_shared/prompts.ts";

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Create new session
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("interview_sessions")
      .insert({
        stage: "collect",
        user_info: {},
        questions: { part1: [], part2: [], part3: [] },
        progress: { current_part: 1, current_question_index: 0, total_parts: 3 },
        history: [
          { role: "assistant", content: WELCOME_MESSAGE, timestamp: now },
        ],
        answers: [],
        token_count: 0,
      })
      .select("session_id")
      .single();

    if (error) {
      console.error("Error creating session:", error);
      return errorResponse("创建会话失败");
    }

    return jsonResponse({
      session_id: data.session_id,
      welcome_message: WELCOME_MESSAGE,
      stage: "collect",
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return errorResponse("服务器错误");
  }
});
