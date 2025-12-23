import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, jsonResponse, errorResponse } from "../_shared/cors.ts";

// 飞书配置
const FEISHU_APP_ID = Deno.env.get("FEISHU_APP_ID") || "";
const FEISHU_APP_SECRET = Deno.env.get("FEISHU_APP_SECRET") || "";
const BITABLE_APP_ID = Deno.env.get("BITABLE_APP_ID") || "";
const BITABLE_QUESTIONS_TABLE_ID = Deno.env.get("BITABLE_QUESTIONS_TABLE_ID") || "";

// 管理员密码
const ADMIN_PASSWORD = Deno.env.get("ADMIN_PASSWORD") || "tantan2024";

// 获取飞书访问令牌
async function getFeishuAccessToken(): Promise<string> {
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
  return data.tenant_access_token;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 验证管理员密码
    const authHeader = req.headers.get("x-admin-password");
    if (authHeader !== ADMIN_PASSWORD) {
      return errorResponse("未授权访问", 401);
    }

    // 获取飞书访问令牌
    const token = await getFeishuAccessToken();

    // 获取调研问题表的所有记录
    const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${BITABLE_APP_ID}/tables/${BITABLE_QUESTIONS_TABLE_ID}/records?page_size=500`;
    
    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();
    console.log("飞书响应:", data.code, data.msg);

    if (data.code !== 0) {
      return errorResponse(`获取数据失败: ${data.msg}`);
    }

    const records = data.data?.items || [];

    // 统计每个公司的问题数量
    const companyMap = new Map<string, { questionCount: number; part1: number; part2: number; part3: number }>();
    
    for (const record of records) {
      const fields = record.fields;
      const companyName = fields["被调研公司名称"];
      
      if (companyName && typeof companyName === "string") {
        const existing = companyMap.get(companyName) || { questionCount: 0, part1: 0, part2: 0, part3: 0 };
        existing.questionCount++;
        
        // 统计各部分问题数量
        if (fields["part1"]) existing.part1++;
        if (fields["part2"]) existing.part2++;
        if (fields["part3"]) existing.part3++;
        
        companyMap.set(companyName, existing);
      }
    }

    // 转换为数组并排序
    const companies = Array.from(companyMap.entries())
      .filter(([name]) => name !== "默认") // 排除默认
      .map(([name, stats]) => ({
        name,
        questionCount: stats.questionCount,
        part1Count: stats.part1,
        part2Count: stats.part2,
        part3Count: stats.part3,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));

    return jsonResponse({
      success: true,
      companies,
      total: companies.length,
    });

  } catch (err) {
    console.error("获取公司列表失败:", err);
    return errorResponse(`获取公司列表失败: ${err instanceof Error ? err.message : String(err)}`);
  }
});

