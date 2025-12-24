import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ========== 内联 CORS 工具 ==========
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-password",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, DELETE",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 500): Response {
  return jsonResponse({ error: message }, status);
}
// ========== 内联 CORS 工具结束 ==========

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// 飞书配置
const FEISHU_APP_ID = Deno.env.get("FEISHU_APP_ID") || "";
const FEISHU_APP_SECRET = Deno.env.get("FEISHU_APP_SECRET") || "";
const BITABLE_APP_TOKEN = Deno.env.get("BITABLE_APP_TOKEN") || "";
const BITABLE_LINKS_TABLE_ID = Deno.env.get("BITABLE_LINKS_TABLE_ID") || "tblC6Qv0zVVSU9x0";

// Webhook 验证令牌（可选，用于安全验证）
const WEBHOOK_SECRET = Deno.env.get("FEISHU_WEBHOOK_SECRET") || "";

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

// 获取飞书访问令牌
async function getFeishuAccessToken(): Promise<string | null> {
  if (!FEISHU_APP_ID || !FEISHU_APP_SECRET) {
    console.log("飞书配置不完整");
    return null;
  }

  try {
    const response = await fetch(
      "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          app_id: FEISHU_APP_ID,
          app_secret: FEISHU_APP_SECRET,
        }),
      }
    );

    const data = await response.json();
    if (data.code === 0) {
      return data.tenant_access_token;
    }
    console.error("获取飞书token失败:", data.msg);
  } catch (err) {
    console.error("获取飞书token异常:", err);
  }
  return null;
}

// 更新飞书多维表格记录
async function updateFeishuRecord(
  token: string,
  recordId: string,
  linkUrl: string
): Promise<boolean> {
  if (!BITABLE_APP_TOKEN || !BITABLE_LINKS_TABLE_ID) {
    console.log("飞书表格配置不完整，跳过写回");
    return false;
  }

  try {
    const response = await fetch(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${BITABLE_APP_TOKEN}/tables/${BITABLE_LINKS_TABLE_ID}/records/${recordId}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fields: {
            // 直接使用字符串格式，飞书会自动识别为链接
            "访谈链接": linkUrl,
          },
        }),
      }
    );

    const data = await response.json();
    if (data.code === 0) {
      console.log(`成功更新记录 ${recordId} 的链接`);
      return true;
    } else {
      console.error(`更新记录失败: ${data.msg}`);
      return false;
    }
  } catch (err) {
    console.error("更新飞书记录异常:", err);
    return false;
  }
}

// 从富文本格式提取纯文本
function extractText(field: unknown): string {
  if (!field) return "";
  
  // 飞书多维表格的文本字段可能是数组格式 [{type: "text", text: "..."}]
  if (Array.isArray(field)) {
    return field.map((item) => {
      if (typeof item === "object" && item !== null && "text" in item) {
        return String(item.text);
      }
      return String(item);
    }).join("").trim();
  }
  
  if (typeof field === "string") {
    return field.trim();
  }
  
  return "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("仅支持 POST 请求", 405);
  }

  try {
    const body = await req.json();
    console.log("收到飞书 Webhook:", JSON.stringify(body).substring(0, 500));

    // 处理飞书验证请求（URL Verification）
    if (body.type === "url_verification") {
      return jsonResponse({ challenge: body.challenge });
    }

    // 验证 token（如果配置了）
    if (WEBHOOK_SECRET && body.token !== WEBHOOK_SECRET) {
      console.error("Webhook token 验证失败");
      return errorResponse("验证失败", 401);
    }

    // 处理事件
    const event = body.event || body;
    
    // 从事件中提取记录信息
    // 飞书自动化机器人发送的数据格式可能是：
    // 1. 直接传递字段数据
    // 2. 包含 record_id 和 fields
    let recordId = event.record_id || event.recordId || body.record_id;
    let fields = event.fields || event.data || body.fields || body.data || body;

    // 尝试从不同的数据结构中提取公司名称
    let companyName = extractText(fields["公司名称"]) || 
                      extractText(fields.company_name) ||
                      extractText(body.company_name) ||
                      extractText(body["公司名称"]);
    
    let interviewerName = extractText(fields["访谈者"]) || 
                          extractText(fields.interviewer_name) ||
                          extractText(body.interviewer_name) ||
                          extractText(body["访谈者"]);
    
    let purpose = extractText(fields["本次访谈目的"]) || 
                  extractText(fields.purpose) ||
                  extractText(body.purpose) ||
                  extractText(body["本次访谈目的"]);

    if (!companyName) {
      console.log("未找到公司名称，原始数据:", JSON.stringify(body));
      return errorResponse("缺少公司名称", 400);
    }

    console.log(`处理: 公司=${companyName}, 访谈者=${interviewerName}, 目的=${purpose}, 记录ID=${recordId}`);

    // 生成链接
    const linkCode = generateLinkCode();
    const baseUrl = Deno.env.get("BASE_URL") || "https://tantan.vercel.app";
    const linkUrl = `${baseUrl}/i/${linkCode}`;

    // 保存到数据库
    const { data: link, error } = await supabase
      .from("interview_links")
      .insert({
        company_name: companyName,
        interviewer_name: interviewerName || null,
        purpose: purpose || null,
        link_code: linkCode,
      })
      .select()
      .single();

    if (error) {
      console.error("保存链接失败:", error);
      throw error;
    }

    console.log("链接已创建:", linkUrl);

    // 如果有记录ID，回写到飞书
    let feishuUpdated = false;
    if (recordId) {
      const token = await getFeishuAccessToken();
      if (token) {
        feishuUpdated = await updateFeishuRecord(token, recordId, linkUrl);
      }
    }

    return jsonResponse({
      success: true,
      link_code: linkCode,
      interview_link: linkUrl,
      link_url: linkUrl,
      company_name: companyName,
      interviewer_name: interviewerName,
      purpose: purpose,
      feishu_updated: feishuUpdated,
    });
  } catch (err) {
    console.error("处理 Webhook 失败:", err);
    return errorResponse(
      `处理失败: ${err instanceof Error ? err.message : String(err)}`
    );
  }
});
