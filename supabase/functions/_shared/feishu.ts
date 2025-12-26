// 飞书 API 服务 - 查询多维表格和保存记录

interface FeishuConfig {
  appId: string;
  appSecret: string;
  appToken: string;
  questionsTableId: string;
  recordsTableId?: string;
  webhookRecordsUrl?: string;
}

let accessToken: string | null = null;
let tokenExpiresAt = 0;

function getConfig(): FeishuConfig {
  return {
    appId: Deno.env.get("FEISHU_APP_ID") || "",
    appSecret: Deno.env.get("FEISHU_APP_SECRET") || "",
    appToken: Deno.env.get("BITABLE_APP_TOKEN") || "",
    questionsTableId: Deno.env.get("BITABLE_QUESTIONS_TABLE_ID") || "",
    recordsTableId: Deno.env.get("BITABLE_RECORDS_TABLE_ID") || "",
    webhookRecordsUrl: Deno.env.get("WEBHOOK_RECORDS_URL") || "",
  };
}

function isConfigured(): boolean {
  const config = getConfig();
  return !!(config.appId && config.appSecret && config.appToken && config.questionsTableId);
}

async function getAccessToken(): Promise<string | null> {
  const now = Date.now();
  if (accessToken && now < tokenExpiresAt - 60000) {
    return accessToken;
  }

  const config = getConfig();
  if (!config.appId || !config.appSecret) {
    console.log("飞书配置不完整，跳过 API 调用");
    return null;
  }

  try {
    const response = await fetch(
      "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          app_id: config.appId,
          app_secret: config.appSecret,
        }),
      }
    );

    if (response.ok) {
      const data = await response.json();
      if (data.code === 0) {
        accessToken = data.tenant_access_token;
        tokenExpiresAt = now + (data.expire || 7200) * 1000;
        console.log("获取飞书访问令牌成功");
        return accessToken;
      } else {
        console.error("获取令牌失败:", data.msg);
      }
    }
  } catch (err) {
    console.error("获取访问令牌异常:", err);
  }

  return null;
}

function parseQuestions(text: unknown): string[] {
  if (!text) return [];

  console.log("原始问题数据类型:", typeof text);
  console.log("原始问题数据:", JSON.stringify(text).substring(0, 500));

  // 飞书多维表格的文本字段可能是数组格式 [{type: "text", text: "..."}]
  if (Array.isArray(text)) {
    // 可能是飞书的富文本格式
    const extracted = text.map((item) => {
      if (typeof item === "object" && item !== null && "text" in item) {
        return String(item.text).trim();
      }
      return String(item).trim();
    }).filter(Boolean);
    
    // 如果提取后是单个长字符串，按换行分割
    if (extracted.length === 1 && extracted[0].includes("\n")) {
      return extracted[0].split("\n")
        .map(line => line.trim().replace(/^[\d]+[.、)）\s]+/, "").trim())
        .filter(Boolean);
    }
    
    return extracted;
  }

  if (typeof text === "string") {
    const lines = text.trim().split("\n");
    return lines
      .map((line) => {
        line = line.trim();
        // 移除序号前缀
        return line.replace(/^[\d]+[.、)）\s]+/, "").trim();
      })
      .filter(Boolean);
  }

  return [];
}

export async function queryQuestionsFromFeishu(
  theme: string,
  companyName?: string | null
): Promise<{ part1: string[]; part2: string[]; part3: string[] } | null> {
  if (!isConfigured()) {
    console.log("飞书配置不完整，无法查询");
    return null;
  }

  const token = await getAccessToken();
  if (!token) return null;

  const config = getConfig();

  try {
    // 构建查询条件：优先查询 theme + company，其次查询 theme（company为空）
    let filterFormula: string;
    
    if (companyName) {
      // 查询特定主题+公司的问题
      filterFormula = `AND(CurrentValue.[调研主题] = "${theme}", CurrentValue.[被调研公司名称] = "${companyName}")`;
    } else {
      // 查询特定主题的通用问题（公司名称为空）
      filterFormula = `AND(CurrentValue.[调研主题] = "${theme}", OR(CurrentValue.[被调研公司名称] = "", NOT(CurrentValue.[被调研公司名称])))`;
    }
    
    const url = new URL(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${config.appToken}/tables/${config.questionsTableId}/records`
    );
    url.searchParams.set("filter", filterFormula);
    url.searchParams.set("page_size", "1");

    console.log(`飞书查询条件: 主题=${theme}, 公司=${companyName || '空'}`);

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      const data = await response.json();
      if (data.code === 0) {
        const items = data.data?.items || [];
        if (items.length > 0) {
          const record = items[0].fields || {};
          const result = {
            part1: parseQuestions(record.part1),
            part2: parseQuestions(record.part2),
            part3: parseQuestions(record.part3),
          };
          console.log(`从飞书查询到 ${theme}${companyName ? ' - ' + companyName : '(通用)'} 的问题`);
          return result;
        } else {
          console.log(`飞书未找到 ${theme}${companyName ? ' - ' + companyName : '(通用)'} 的记录`);
        }
      } else {
        console.error("飞书查询失败:", data.msg);
      }
    } else {
      console.error("飞书请求失败:", response.status);
    }
  } catch (err) {
    console.error("查询飞书多维表格异常:", err);
  }

  return null;
}

export async function saveInterviewRecord(params: {
  sessionId: string;
  userName: string;
  company: string;
  conversationHistory: string;
  status: string;
  tokenCount: number;
  summary: string;
}): Promise<boolean> {
  const config = getConfig();

  // 方式1：通过 Webhook 保存（推荐）
  if (config.webhookRecordsUrl) {
    return await saveViaWebhook(config.webhookRecordsUrl, params);
  }

  // 方式2：通过 API 直接创建记录
  if (config.appToken && config.recordsTableId) {
    return await saveViaApi(params);
  }

  console.log("未配置记录保存方式，跳过保存到飞书");
  return false;
}

async function saveViaWebhook(
  webhookUrl: string,
  params: {
    sessionId: string;
    userName: string;
    company: string;
    conversationHistory: string;
    status: string;
    tokenCount: number;
    summary: string;
  }
): Promise<boolean> {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        data: {
          ID: params.sessionId,
          用户: params.userName,
          公司: params.company,
          对话记录: params.conversationHistory,
          执行状态: params.status,
          Token消耗: params.tokenCount,
          访谈分析: params.summary,
        },
      }),
    });

    if (response.ok) {
      console.log(`访谈记录保存成功(Webhook): ${params.sessionId}`);
      return true;
    } else {
      console.error(`保存记录失败(Webhook): ${response.status}`);
      return false;
    }
  } catch (err) {
    console.error("保存记录出错(Webhook):", err);
    return false;
  }
}

async function saveViaApi(params: {
  sessionId: string;
  userName: string;
  company: string;
  conversationHistory: string;
  status: string;
  tokenCount: number;
  summary: string;
}): Promise<boolean> {
  const token = await getAccessToken();
  if (!token) return false;

  const config = getConfig();

  try {
    const response = await fetch(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${config.appToken}/tables/${config.recordsTableId}/records`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fields: {
            ID: params.sessionId,
            用户: params.userName,
            公司: params.company,
            对话记录: params.conversationHistory,
            执行状态: params.status,
            Token消耗: params.tokenCount,
            访谈分析: params.summary,
          },
        }),
      }
    );

    if (response.ok) {
      const data = await response.json();
      if (data.code === 0) {
        console.log(`访谈记录保存成功(API): ${params.sessionId}`);
        return true;
      } else {
        console.error(`保存记录失败(API): ${data.msg}`);
        return false;
      }
    } else {
      console.error(`保存记录请求失败(API): ${response.status}`);
      return false;
    }
  } catch (err) {
    console.error("保存记录出错(API):", err);
    return false;
  }
}

// 获取公司问题（带缓存）
export async function fetchQuestionsForCompany(
  theme: string,
  companyName: string | null,
  supabase: any
): Promise<{ part1: string[]; part2: string[]; part3: string[] }> {
  const defaultQuestions = {
    part1: [`请问您对${theme}有哪些了解？`],
    part2: [`在${theme}方面，您认为最重要的是什么？`],
    part3: ["除了上述问题外，您还有哪些想要补充的内容？"],
  };

  try {
    console.log(`查询问题库: theme=${theme}, company=${companyName || '空'}`);
    
    // 1. 如果有公司名，先查询 theme + company 的缓存
    if (companyName) {
      const { data, error } = await supabase
        .from("questions_cache")
        .select("*")
        .eq("theme", theme)
        .eq("company_name", companyName)
        .maybeSingle();
      
      if (!error && data && data.part1?.length > 0) {
        console.log(`✓ 从缓存加载 ${theme} - ${companyName} 的问题`);
        return {
          part1: data.part1 || [],
          part2: data.part2 || [],
          part3: data.part3 || [],
        };
      }
      
      // 2. 缓存没有，查询飞书 theme + company
      const feishuResultWithCompany = await queryQuestionsFromFeishu(theme, companyName);
      if (feishuResultWithCompany && feishuResultWithCompany.part1?.length > 0) {
        // 保存到缓存
        await supabase.from("questions_cache").upsert({
          theme,
          company_name: companyName,
          part1: feishuResultWithCompany.part1,
          part2: feishuResultWithCompany.part2,
          part3: feishuResultWithCompany.part3,
          updated_at: new Date().toISOString(),
        });
        console.log(`✓ 从飞书加载 ${theme} - ${companyName} 的问题并缓存`);
        return feishuResultWithCompany;
      }
    }
    
    // 3. 查询 theme 通用问题的缓存（company_name 为 null 或空）
    const { data: themeCache, error: themeCacheError } = await supabase
      .from("questions_cache")
      .select("*")
      .eq("theme", theme)
      .or("company_name.is.null,company_name.eq.")
      .maybeSingle();

    if (!themeCacheError && themeCache && themeCache.part1?.length > 0) {
      console.log(`✓ 从缓存加载 ${theme} 通用问题`);
      return {
        part1: themeCache.part1 || [],
        part2: themeCache.part2 || [],
        part3: themeCache.part3 || [],
      };
    }

    // 4. 缓存没有，查询飞书 theme 通用问题（company为空）
    const feishuResultThemeOnly = await queryQuestionsFromFeishu(theme, null);
    if (feishuResultThemeOnly && feishuResultThemeOnly.part1?.length > 0) {
      // 保存到缓存
      await supabase.from("questions_cache").upsert({
        theme,
        company_name: null,
        part1: feishuResultThemeOnly.part1,
        part2: feishuResultThemeOnly.part2,
        part3: feishuResultThemeOnly.part3,
        updated_at: new Date().toISOString(),
      });
      console.log(`✓ 从飞书加载 ${theme} 通用问题并缓存`);
      return feishuResultThemeOnly;
    }

    // 5. 最后使用内置默认问题
    console.log(`⚠ 未找到 ${theme} 的问题，使用内置默认问题`);
    return defaultQuestions;
  } catch (err) {
    console.error("获取问题失败:", err);
    return defaultQuestions;
  }
}
