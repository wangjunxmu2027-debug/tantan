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
const ADMIN_PASSWORD = Deno.env.get("ADMIN_PASSWORD") || "tantan2024";

// 飞书配置
const FEISHU_APP_ID = Deno.env.get("FEISHU_APP_ID") || "";
const FEISHU_APP_SECRET = Deno.env.get("FEISHU_APP_SECRET") || "";
const BITABLE_APP_TOKEN = Deno.env.get("BITABLE_APP_TOKEN") || "";
const BITABLE_LINKS_TABLE_ID = Deno.env.get("BITABLE_LINKS_TABLE_ID") || "tblC6Qv0zVVSU9x0";

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
            "访谈链接": {
              link: linkUrl,
              text: linkUrl,
            },
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

// 批量创建飞书记录
async function createFeishuRecords(
  token: string,
  records: Array<{
    theme: string;
    company_name?: string;
    interviewer_name?: string;
    purpose?: string;
    link_url: string;
  }>
): Promise<boolean> {
  if (!BITABLE_APP_TOKEN || !BITABLE_LINKS_TABLE_ID) {
    console.log("飞书表格配置不完整，跳过创建记录");
    return false;
  }

  try {
    const feishuRecords = records.map((r) => ({
      fields: {
        "调研主题": r.theme,
        "公司名称": r.company_name || "",
        "访谈者": r.interviewer_name || "",
        "本次访谈目的": r.purpose || "",
        "访谈链接": {
          link: r.link_url,
          text: r.link_url,
        },
      },
    }));

    const response = await fetch(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${BITABLE_APP_TOKEN}/tables/${BITABLE_LINKS_TABLE_ID}/records/batch_create`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ records: feishuRecords }),
      }
    );

    const data = await response.json();
    if (data.code === 0) {
      console.log(`成功创建 ${records.length} 条飞书记录`);
      return true;
    } else {
      console.error(`批量创建记录失败: ${data.msg}`);
      return false;
    }
  } catch (err) {
    console.error("创建飞书记录异常:", err);
    return false;
  }
}

interface BatchItem {
  theme: string; // 调研主题（必填）
  company_name?: string | null; // 公司名称（选填）
  interviewer_name?: string | null; // 访谈者（选填）
  purpose?: string | null; // 访谈目的（选填）
  record_id?: string; // 飞书记录ID，用于回写
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

  if (req.method !== "POST") {
    return errorResponse("仅支持 POST 请求", 405);
  }

  try {
    const body = await req.json();
    const {
      items,           // 批量数据项
      expires_hours,   // 过期小时数
      max_uses,        // 最大使用次数
      write_to_feishu, // 是否写回飞书
      base_url,        // 链接基础 URL
    } = body as {
      items: BatchItem[];
      expires_hours?: number;
      max_uses?: number;
      write_to_feishu?: boolean;
      base_url?: string;
    };

    if (!items || !Array.isArray(items) || items.length === 0) {
      return errorResponse("缺少批量数据", 400);
    }

    const baseUrl = base_url || "https://tantan.vercel.app";
    const results: Array<{
      theme: string;
      company_name?: string;
      interviewer_name?: string;
      purpose?: string;
      link_code: string;
      link_url: string;
      record_id?: string;
    }> = [];

    // 批量创建链接
    const linksToCreate = items.map((item) => ({
      theme: item.theme || "公司调研",
      company_name: item.company_name || null,
      interviewer_name: item.interviewer_name || null,
      purpose: item.purpose || null,
      link_code: generateLinkCode(),
      expires_at: expires_hours
        ? new Date(Date.now() + expires_hours * 60 * 60 * 1000).toISOString()
        : null,
      max_uses: max_uses || 0,
    }));

    const { data: createdLinks, error } = await supabase
      .from("interview_links")
      .insert(linksToCreate)
      .select();

    if (error) {
      throw error;
    }

    // 构建结果
    for (let i = 0; i < (createdLinks || []).length; i++) {
      const link = createdLinks![i];
      const item = items[i];
      results.push({
        theme: link.theme,
        company_name: link.company_name,
        interviewer_name: link.interviewer_name,
        purpose: link.purpose,
        link_code: link.link_code,
        link_url: `${baseUrl}/i/${link.link_code}`,
        record_id: item.record_id,
      });
    }

    // 如果需要写回飞书
    let feishuWriteSuccess = false;
    if (write_to_feishu) {
      const token = await getFeishuAccessToken();
      if (token) {
        // 如果有 record_id，更新现有记录
        const itemsWithRecordId = results.filter((r) => r.record_id);
        const itemsWithoutRecordId = results.filter((r) => !r.record_id);

        // 更新已有记录
        for (const item of itemsWithRecordId) {
          await updateFeishuRecord(token, item.record_id!, item.link_url);
        }

        // 创建新记录
        if (itemsWithoutRecordId.length > 0) {
          await createFeishuRecords(token, itemsWithoutRecordId);
        }

        feishuWriteSuccess = true;
      }
    }

    return jsonResponse({
      success: true,
      count: results.length,
      links: results,
      feishu_write: write_to_feishu ? feishuWriteSuccess : null,
    });
  } catch (err) {
    console.error("批量创建链接失败:", err);
    return errorResponse(
      `操作失败: ${err instanceof Error ? err.message : String(err)}`
    );
  }
});

