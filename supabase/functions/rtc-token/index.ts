import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";

// 火山引擎 RTC Token 生成
// 参考文档: https://www.volcengine.com/docs/6348/70121

const APP_ID = Deno.env.get("VOLC_RTC_APP_ID") || "";
const APP_KEY = Deno.env.get("VOLC_RTC_APP_KEY") || "";
const VOLC_ACCESS_KEY = Deno.env.get("VOLC_ACCESS_KEY") || "";
const VOLC_SECRET_KEY = Deno.env.get("VOLC_SECRET_KEY") || "";
const ARK_BOT_ID = Deno.env.get("ARK_BOT_ID") || ""; // 火山方舟智能体 ID

// 简化的 Token 生成（实际生产环境需要使用火山引擎官方 SDK）
async function generateRTCToken(
  appId: string,
  appKey: string,
  roomId: string,
  userId: string,
  expireTime: number = 3600
): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000) + expireTime;
  const nonce = crypto.randomUUID().replace(/-/g, "").substring(0, 16);
  
  // 构建签名字符串
  const signStr = `${appId}${appKey}${roomId}${userId}${timestamp}`;
  
  // 使用 HMAC-SHA256 生成签名
  const encoder = new TextEncoder();
  const keyData = encoder.encode(appKey);
  const messageData = encoder.encode(signStr);
  
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
  const signatureHex = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
  
  // 构建 Token（Base64 编码的 JSON）
  const tokenData = {
    version: "001",
    appId,
    roomId,
    userId,
    timestamp,
    nonce,
    signature: signatureHex,
    privilege: {
      SubscribeStream: 1,
      PublishStream: 1,
    },
  };
  
  return btoa(JSON.stringify(tokenData));
}

// 启动 AI 智能体加入 RTC 房间
// 使用火山引擎对话式 AI 服务
async function startAIAgent(roomId: string, taskId: string): Promise<any> {
  const apiUrl = "https://rtc.volcengineapi.com/";
  const action = "StartVoiceChat";
  const version = "2024-06-01";
  
  const requestBody = {
    AppId: APP_ID,
    RoomId: roomId,
    TaskId: taskId,
    Config: {
      // ASR 配置
      ASRConfig: {
        ProviderConfig: {
          Vendor: "volcano", // 使用火山引擎 ASR
          Params: JSON.stringify({
            app: {
              appid: "your_asr_appid", // 需要配置
              cluster: "volc_asr_public"
            },
            audio: {
              format: "pcm",
              sample_rate: 16000
            }
          })
        }
      },
      // TTS 配置  
      TTSConfig: {
        ProviderConfig: {
          Vendor: "volcano", // 使用火山引擎 TTS
          Params: JSON.stringify({
            app: {
              appid: "your_tts_appid", // 需要配置
              cluster: "volc_tts_public"
            },
            audio: {
              voice_type: "zh_female_qingxin", // 清新女声
              speed_ratio: 1.0,
              volume_ratio: 1.0
            }
          })
        }
      },
      // LLM 配置（使用火山方舟）
      LLMConfig: {
        Mode: "ArkV3Bot",
        EndPointId: ARK_BOT_ID,
        Params: JSON.stringify({
          system_prompt: `你是探探，一个友好的企业调研访谈员。你正在进行一场语音访谈，请用简洁、口语化的方式与用户交流。

访谈规则：
1. 每次只问一个问题
2. 认真倾听用户回答，适当追问
3. 保持友好、专业的态度
4. 用口语化的表达，避免书面语

开场白：您好，我是探探。很高兴能和您进行这次访谈。请问您贵姓，来自哪家公司呢？`
        })
      },
      // 中断配置
      InterruptConfig: {
        InterruptMode: 1, // 允许打断
      }
    }
  };

  // 签名请求（简化版本，实际需要完整的火山引擎签名）
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  
  try {
    const response = await fetch(`${apiUrl}?Action=${action}&Version=${version}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Date": timestamp,
        // 实际需要添加火山引擎签名头
      },
      body: JSON.stringify(requestBody),
    });

    return await response.json();
  } catch (error) {
    console.error("启动 AI 智能体失败:", error);
    throw error;
  }
}

Deno.serve(async (req: Request) => {
  // 处理 CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sessionId, action } = await req.json();

    if (!sessionId) {
      return errorResponse("缺少 sessionId", 400);
    }

    const roomId = `interview_${sessionId.substring(0, 8)}`;
    const userId = `user_${Date.now()}`;
    const aiUserId = `ai_tantan`;

    if (action === "start") {
      // 生成用户 Token
      const userToken = await generateRTCToken(APP_ID, APP_KEY, roomId, userId);
      
      console.log(`RTC 房间创建: ${roomId}, 用户: ${userId}`);

      // 尝试启动 AI 智能体（如果配置了相关密钥）
      let aiStatus = "not_configured";
      if (VOLC_ACCESS_KEY && VOLC_SECRET_KEY && ARK_BOT_ID) {
        try {
          const taskId = `task_${Date.now()}`;
          await startAIAgent(roomId, taskId);
          aiStatus = "started";
          console.log(`AI 智能体已启动: ${roomId}`);
        } catch (err) {
          console.error("启动 AI 智能体失败:", err);
          aiStatus = "failed";
        }
      }

      return jsonResponse({
        success: true,
        roomId,
        userId,
        token: userToken,
        appId: APP_ID,
        aiStatus,
        // 返回 WebSocket 连接信息（用于对话式 AI）
        wsUrl: `wss://rtc.volcengineapi.com`,
      });
    } else if (action === "stop") {
      // 结束通话，清理资源
      console.log(`RTC 房间结束: ${roomId}`);
      
      return jsonResponse({
        success: true,
        message: "通话已结束",
      });
    }

    return errorResponse("无效的 action", 400);
  } catch (err) {
    console.error("RTC Token 生成失败:", err);
    return errorResponse(`生成 Token 失败: ${err instanceof Error ? err.message : String(err)}`);
  }
});

