// LLM Service for calling OpenAI-compatible APIs

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

interface LLMResponse {
  content: string;
  tokensUsed: number;
}

export async function callLLM(
  messages: Message[],
  options: {
    temperature?: number;
    maxTokens?: number;
  } = {}
): Promise<LLMResponse> {
  const apiKey = Deno.env.get("LLM_API_KEY") || "";
  const rawBaseUrl = Deno.env.get("LLM_API_BASE_URL") || "https://api.openai.com/v1";
  // 移除结尾的斜杠
  const baseUrl = rawBaseUrl.replace(/\/+$/, "");
  const model = Deno.env.get("LLM_MODEL") || "gpt-4o";

  const { temperature = 0.7, maxTokens = 2000 } = options;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("LLM API error:", response.status, errorText);
    console.error("LLM Config - baseUrl:", baseUrl, "model:", model);
    throw new Error(`LLM API error: ${response.status} - ${errorText}`);
  }

  const responseText = await response.text();
  console.log("LLM API 原始响应:", responseText.substring(0, 500));
  
  let data;
  try {
    data = JSON.parse(responseText);
  } catch (e) {
    console.error("LLM API 响应不是有效的 JSON:", responseText.substring(0, 200));
    throw new Error(`LLM API 响应解析失败: ${responseText.substring(0, 100)}`);
  }
  
  // 确保响应格式正确
  if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
    console.error("LLM API 响应格式异常:", JSON.stringify(data).substring(0, 500));
    throw new Error(`LLM API 响应格式异常: ${JSON.stringify(data).substring(0, 200)}`);
  }
  
  return {
    content: data.choices[0]?.message?.content || "",
    tokensUsed: data.usage?.total_tokens || 0,
  };
}

export async function extractUserInfo(
  userInput: string
): Promise<{
  company: string | null;
  surname: string | null;
  fullName: string | null;
  confidence: number;
  tokensUsed: number;
}> {
  const { getExtractInfoPrompt } = await import("./prompts.ts");
  const prompt = getExtractInfoPrompt(userInput);

  const { content, tokensUsed } = await callLLM(
    [
      {
        role: "system",
        content: "你是一个信息提取助手，请严格按照要求的JSON格式输出。",
      },
      { role: "user", content: prompt },
    ],
    { temperature: 0.1, maxTokens: 500 }
  );

  try {
    // Try to parse JSON directly
    const result = JSON.parse(content);
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      return {
        company: result.company || null,
        surname: result.surname || null,
        fullName: result.full_name || result.fullName || null,
        confidence: result.confidence || 0,
        tokensUsed,
      };
    }
  } catch {
    // Try to extract JSON from response
    const jsonMatch = content.match(/\{[^{}]*\}/s);
    if (jsonMatch) {
      try {
        const result = JSON.parse(jsonMatch[0]);
        if (result && typeof result === 'object') {
          return {
            company: result.company || null,
            surname: result.surname || null,
            fullName: result.full_name || result.fullName || null,
            confidence: result.confidence || 0,
            tokensUsed,
          };
        }
      } catch {
        // Fall through to default
      }
    }
  }
  
  console.log("无法解析 LLM 响应:", content);
  return {
    company: null,
    surname: null,
    fullName: null,
    confidence: 0,
    tokensUsed,
  };
}

export async function generateInterviewStart(
  surname: string,
  company: string,
  part1Questions: string[] = [],
  part2Questions: string[] = [],
  part3Questions: string[] = []
): Promise<{ content: string; tokensUsed: number }> {
  const { getInterviewStartPrompt } = await import("./prompts.ts");
  const safeP1 = part1Questions || [];
  const safeP2 = part2Questions || [];
  const safeP3 = part3Questions || [];
  const firstQuestion = safeP1[0] || "请介绍一下您的主要工作内容";
  const prompt = getInterviewStartPrompt(
    surname,
    company,
    safeP1,
    safeP2,
    safeP3,
    firstQuestion
  );

  return callLLM([{ role: "user", content: prompt }], {
    temperature: 0.7,
    maxTokens: 1000,
  });
}

export async function generateInterviewResponse(
  surname: string,
  company: string,
  currentPart: number,
  currentQuestionIndex: number,
  part1Questions: string[],
  part2Questions: string[],
  part3Questions: string[],
  currentQuestion: string,
  conversationHistory: Array<{ role: string; content: string }>,
  userMessage: string
): Promise<{ content: string; tokensUsed: number }> {
  const { getInterviewPrompt } = await import("./prompts.ts");

  // Format conversation history
  const historyStr = conversationHistory
    .slice(-10)
    .map((m) => `${m.role === "assistant" ? "助手" : "用户"}: ${m.content}`)
    .join("\n\n");

  const prompt = getInterviewPrompt(
    surname,
    company,
    currentPart,
    currentQuestionIndex,
    part1Questions,
    part2Questions,
    part3Questions,
    currentQuestion,
    historyStr,
    userMessage
  );

  return callLLM(
    [
      { role: "system", content: prompt },
      { role: "user", content: userMessage },
    ],
    { temperature: 0.7, maxTokens: 1500 }
  );
}

export async function generateThanks(
  surname: string
): Promise<{ content: string; tokensUsed: number }> {
  const { getThanksPrompt } = await import("./prompts.ts");
  const prompt = getThanksPrompt(surname);

  return callLLM([{ role: "user", content: prompt }], {
    temperature: 0.7,
    maxTokens: 500,
  });
}

export async function generateSummary(
  fullName: string,
  company: string,
  interviewTime: string,
  qaList: Array<{ question: string; answer: string; part: number }>
): Promise<{ content: string; tokensUsed: number }> {
  const { getSummaryPrompt } = await import("./prompts.ts");
  const prompt = getSummaryPrompt(fullName, company, interviewTime, qaList);

  return callLLM(
    [
      {
        role: "system",
        content:
          "你是一位专业的商业分析师，请根据访谈记录生成结构化的分析报告。",
      },
      { role: "user", content: prompt },
    ],
    { temperature: 0.5, maxTokens: 3000 }
  );
}
