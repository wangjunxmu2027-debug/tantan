import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";

// 火山引擎 RTC Token 生成
// 参考文档: https://www.volcengine.com/docs/6348/70121

const APP_ID = Deno.env.get("VOLC_RTC_APP_ID") || "";
const APP_KEY = Deno.env.get("VOLC_RTC_APP_KEY") || "";

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

      return jsonResponse({
        success: true,
        roomId,
        userId,
        token: userToken,
        appId: APP_ID,
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

