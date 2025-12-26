import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-password",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
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

const FEISHU_APP_ID = Deno.env.get("FEISHU_APP_ID") || "";
const FEISHU_APP_SECRET = Deno.env.get("FEISHU_APP_SECRET") || "";
const BITABLE_APP_TOKEN = Deno.env.get("BITABLE_APP_TOKEN") || "";
const BITABLE_QUESTIONS_TABLE_ID = Deno.env.get("BITABLE_QUESTIONS_TABLE_ID") || "";
const ADMIN_PASSWORD = Deno.env.get("ADMIN_PASSWORD") || "tantan2024";

// 获取飞书 access token
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

// 从飞书多维表格获取所有唯一的调研主题
async function fetchThemesFromFeishu(token: string): Promise<string[]> {
  if (!BITABLE_APP_TOKEN || !BITABLE_QUESTIONS_TABLE_ID) {
    console.log("飞书表格配置不完整");
    return [];
  }

  try {
    const themes = new Set<string>();
    let hasMore = true;
    let pageToken = "";

    // 分页获取所有记录
    while (hasMore) {
      const url = new URL(
        `https://open.feishu.cn/open-apis/bitable/v1/apps/${BITABLE_APP_TOKEN}/tables/${BITABLE_QUESTIONS_TABLE_ID}/records`
      );
      url.searchParams.set("page_size", "100");
      if (pageToken) {
        url.searchParams.set("page_token", pageToken);
      }

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();
      
      if (data.code === 0) {
        const items = data.data?.items || [];
        
        // 提取调研主题字段
        items.forEach((item: any) => {
          const theme = item.fields?.["调研主题"] || item.fields?.theme;
          if (theme) {
            // 处理可能的数组格式（飞书富文本）
            if (Array.isArray(theme)) {
              const themeText = theme.map((t: any) => 
                typeof t === 'object' && t.text ? t.text : String(t)
              ).join('').trim();
              if (themeText) themes.add(themeText);
            } else if (typeof theme === 'string' && theme.trim()) {
              themes.add(theme.trim());
            }
          }
        });

        hasMore = data.data?.has_more || false;
        pageToken = data.data?.page_token || "";
      } else {
        console.error("飞书查询失败:", data.msg);
        hasMore = false;
      }
    }

    return Array.from(themes).sort();
  } catch (err) {
    console.error("获取调研主题失败:", err);
    return [];
  }
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

  if (req.method !== "GET") {
    return errorResponse("仅支持 GET 请求", 405);
  }

  try {
    // 获取飞书访问令牌
    const token = await getFeishuAccessToken();
    
    if (!token) {
      // 如果飞书未配置，返回默认主题
      return jsonResponse({
        success: true,
        themes: ["公司调研", "白皮书调研", "市场调研", "需求分析"],
        source: "default",
      });
    }

    // 从飞书获取主题列表
    const themes = await fetchThemesFromFeishu(token);

    if (themes.length === 0) {
      // 如果飞书没有数据，返回默认主题
      return jsonResponse({
        success: true,
        themes: ["公司调研", "白皮书调研", "市场调研", "需求分析"],
        source: "default",
      });
    }

    return jsonResponse({
      success: true,
      themes,
      source: "feishu",
      count: themes.length,
    });
  } catch (err) {
    console.error("获取调研主题列表失败:", err);
    return errorResponse(`操作失败: ${err instanceof Error ? err.message : String(err)}`);
  }
});

