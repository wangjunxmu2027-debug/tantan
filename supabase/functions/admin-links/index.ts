import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, errorResponse } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ADMIN_PASSWORD = Deno.env.get("ADMIN_PASSWORD") || "tantan2024";

// 飞书配置
const FEISHU_APP_ID = Deno.env.get("FEISHU_APP_ID") || "";
const FEISHU_APP_SECRET = Deno.env.get("FEISHU_APP_SECRET") || "";
const BITABLE_APP_TOKEN = Deno.env.get("BITABLE_APP_TOKEN") || "RWGebvPW0aYwmKsyFGtcSwxwnbe";
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

// 获取飞书 access token
async function getFeishuAccessToken(): Promise<string> {
  const response = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_id: FEISHU_APP_ID,
      app_secret: FEISHU_APP_SECRET,
    }),
  });
  
  const data = await response.json();
  if (data.code !== 0) {
    throw new Error(`获取飞书 token 失败: ${data.msg}`);
  }
  return data.tenant_access_token;
}

// 创建飞书多维表格记录
async function createFeishuRecord(
  accessToken: string,
  theme: string,
  companyName: string | null,
  interviewerName: string | null,
  purpose: string | null,
  linkUrl: string
): Promise<boolean> {
  try {
    // 飞书多维表格字段格式说明:
    // - 文本字段: 直接传字符串
    // - 链接字段: 传 { link: "url", text: "显示文字" } 或直接传字符串
    const response = await fetch(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${BITABLE_APP_TOKEN}/tables/${BITABLE_LINKS_TABLE_ID}/records`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fields: {
            "调研主题": theme,
            "公司名称": companyName || "",
            "访谈者": interviewerName || "",
            "本次访谈目的": purpose || "",
            // 如果是"链接"类型字段，使用对象格式
            // 如果是"文本"类型字段，直接使用字符串
            "访谈链接": linkUrl,
          },
        }),
      }
    );

    const data = await response.json();
    console.log("飞书创建记录响应:", JSON.stringify(data));
    
    if (data.code !== 0) {
      console.error("飞书 API 错误:", data.code, data.msg);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error("创建飞书记录失败:", error);
    return false;
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

  const url = new URL(req.url);

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
        theme, // 新增：调研主题
        company_name, 
        interviewer_name,
        purpose,
        expires_hours,
        max_uses,
        batch,
        voice,
        sync_to_feishu, // 是否同步到飞书
        base_url, // 基础URL
      } = body;

      // 批量创建
      if (batch && Array.isArray(body.companies)) {
        const linksToCreate = body.companies.map((company: any) => ({
          theme: theme || '公司调研',
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
      // 调研主题为必填，公司名称改为可选
      if (!theme) {
        return errorResponse("缺少调研主题", 400);
      }

      const linkCode = generateLinkCode();
      const expiresAt = expires_hours 
        ? new Date(Date.now() + expires_hours * 60 * 60 * 1000).toISOString()
        : null;

      const { data, error } = await supabase
        .from("interview_links")
        .insert({
          theme: theme,
          company_name: company_name || null,
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

      // 生成完整链接URL
      const siteUrl = base_url || "https://tantan.vercel.app";
      const linkUrl = `${siteUrl}/i/${linkCode}`;

      // 同步到飞书
      let feishuSynced = false;
      console.log("=== 飞书同步检查 ===");
      console.log("sync_to_feishu:", sync_to_feishu);
      console.log("FEISHU_APP_ID:", FEISHU_APP_ID ? "已设置" : "未设置");
      console.log("FEISHU_APP_SECRET:", FEISHU_APP_SECRET ? "已设置" : "未设置");
      console.log("BITABLE_APP_TOKEN:", BITABLE_APP_TOKEN);
      console.log("BITABLE_LINKS_TABLE_ID:", BITABLE_LINKS_TABLE_ID);
      
      if (sync_to_feishu && FEISHU_APP_ID && FEISHU_APP_SECRET) {
        try {
          console.log("开始同步到飞书...");
          console.log("linkUrl:", linkUrl);
          const accessToken = await getFeishuAccessToken();
          console.log("获取到 accessToken:", accessToken ? "成功" : "失败");
          feishuSynced = await createFeishuRecord(
            accessToken,
            theme,
            company_name || null,
            interviewer_name,
            purpose,
            linkUrl
          );
          console.log("飞书同步结果:", feishuSynced);
        } catch (feishuError) {
          console.error("飞书同步失败:", feishuError);
        }
      } else {
        console.log("跳过飞书同步，原因: sync_to_feishu=", sync_to_feishu, "或环境变量未设置");
      }

      return jsonResponse({
        success: true,
        link: data,
        link_url: linkUrl,
        feishu_synced: feishuSynced,
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
