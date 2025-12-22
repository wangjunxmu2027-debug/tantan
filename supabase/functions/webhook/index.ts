import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";

/**
 * Webhook 回调路由
 * 用于接收飞书自动化流程的回调数据
 */

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const url = new URL(req.url);
    const path = url.pathname;

    // Route based on path
    if (path.includes("/questions/callback")) {
      return await handleQuestionsCallback(req);
    } else if (path.includes("/test")) {
      return await handleTest(req);
    }

    return jsonResponse({ message: "Webhook endpoint ready" });
  } catch (err) {
    console.error("Webhook error:", err);
    return errorResponse("Webhook处理失败");
  }
});

async function handleQuestionsCallback(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    console.log("收到问题回调:", JSON.stringify(body));

    const requestId = body.request_id;
    if (!requestId) {
      return jsonResponse({ success: false, error: "missing request_id" });
    }

    // Extract question data
    const data = body.data || body;
    const questionsData = {
      part1: parseQuestions(data.part1),
      part2: parseQuestions(data.part2),
      part3: parseQuestions(data.part3),
    };

    // Get company name if provided
    const companyName = data.company || body.company;

    if (companyName) {
      // Save to questions_cache
      const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { error } = await supabase
        .from("questions_cache")
        .upsert({
          company_name: companyName,
          part1: questionsData.part1,
          part2: questionsData.part2,
          part3: questionsData.part3,
          updated_at: new Date().toISOString(),
        });

      if (error) {
        console.error("保存问题缓存失败:", error);
      } else {
        console.log(`已保存 ${companyName} 的问题缓存`);
      }
    }

    return jsonResponse({ success: true, request_id: requestId });
  } catch (err) {
    console.error("处理问题回调失败:", err);
    return jsonResponse({ success: false, error: String(err) });
  }
}

async function handleTest(req: Request): Promise<Response> {
  const body = await req.json();
  console.log("收到测试请求:", JSON.stringify(body));
  return jsonResponse({
    success: true,
    message: "Webhook is working",
    received: body,
  });
}

function parseQuestions(text: unknown): string[] {
  if (!text) return [];

  if (Array.isArray(text)) {
    return text.map((q) => String(q).trim()).filter(Boolean);
  }

  if (typeof text === "string") {
    const lines = text.trim().split("\n");
    return lines
      .map((line) => {
        line = line.trim();
        // Remove number prefix like "1." "1、" "(1)"
        return line.replace(/^[\d]+[.、)）\s]+/, "").trim();
      })
      .filter(Boolean);
  }

  return [];
}

