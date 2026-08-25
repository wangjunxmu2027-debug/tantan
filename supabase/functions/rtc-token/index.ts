import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, jsonResponse, errorResponse } from "../_shared/cors.ts";

// 火山引擎 RTC Token 生成
// 参考文档: https://www.volcengine.com/docs/6348/70121

const APP_ID = Deno.env.get("VOLC_RTC_APP_ID") || "";
const APP_KEY = Deno.env.get("VOLC_RTC_APP_KEY") || "";
const TOKEN_VERSION = "001";
const PRIV_PUBLISH_STREAM = 0;
const PRIV_PUBLISH_AUDIO_STREAM = 1;
const PRIV_PUBLISH_VIDEO_STREAM = 2;
const PRIV_PUBLISH_DATA_STREAM = 3;
const PRIV_SUBSCRIBE_STREAM = 4;

class TokenPacker {
  private readonly chunks: Uint8Array[] = [];

  putUint16(value: number) {
    const bytes = new Uint8Array(2);
    new DataView(bytes.buffer).setUint16(0, value, true);
    this.chunks.push(bytes);
    return this;
  }

  putUint32(value: number) {
    const bytes = new Uint8Array(4);
    const dataView = new DataView(bytes.buffer);
    dataView.setUint32(0, value, true);
    this.chunks.push(bytes);
    return this;
  }

  putBytes(bytes: Uint8Array) {
    this.putUint16(bytes.length);
    this.chunks.push(bytes);
    return this;
  }

  putString(value: string) {
    return this.putBytes(new TextEncoder().encode(value));
  }

  pack() {
    const size = this.chunks.reduce((total, chunk) => total + chunk.length, 0);
    const result = new Uint8Array(size);
    let offset = 0;

    for (const chunk of this.chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result;
  }
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

async function sign(appKey: string, message: Uint8Array) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, message));
}

// 火山 RTC 正式 Token：001 + AppID + Base64(长度前缀消息 + HMAC-SHA256 签名)
async function generateRTCToken(
  appId: string,
  appKey: string,
  roomId: string,
  userId: string,
  expireInSeconds = 3600,
): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expireAt = issuedAt + expireInSeconds;
  const nonce = crypto.getRandomValues(new Uint32Array(1))[0];
  const privileges = new Map<number, number>([
    [PRIV_PUBLISH_STREAM, expireAt],
    [PRIV_PUBLISH_AUDIO_STREAM, expireAt],
    [PRIV_PUBLISH_VIDEO_STREAM, expireAt],
    [PRIV_PUBLISH_DATA_STREAM, expireAt],
    [PRIV_SUBSCRIBE_STREAM, expireAt],
  ]);

  const message = new TokenPacker()
    .putUint32(nonce)
    .putUint32(issuedAt)
    .putUint32(expireAt)
    .putString(roomId)
    .putString(userId)
    .putUint16(privileges.size);

  for (const [privilege, privilegeExpireAt] of privileges) {
    message.putUint16(privilege).putUint32(privilegeExpireAt);
  }

  const packedMessage = message.pack();
  const signature = await sign(appKey, packedMessage);
  const content = new TokenPacker()
    .putBytes(packedMessage)
    .putBytes(signature)
    .pack();

  return `${TOKEN_VERSION}${appId}${toBase64(content)}`;
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

    if (action === "start") {
      if (!APP_ID || !APP_KEY) {
        return errorResponse("RTC 未配置", 503);
      }

      const userId = `user_${crypto.randomUUID().replace(/-/g, "")}`;
      // 生成用户 Token
      const userToken = await generateRTCToken(APP_ID, APP_KEY, roomId, userId);
      
      console.log(`RTC 房间创建: ${roomId}, 用户: ${userId}`);

      return jsonResponse({
        success: true,
        roomId,
        userId,
        token: userToken,
        appId: APP_ID,
        expiresInSeconds: 3600,
        // 只负责安全进房。AI 机器人需要对话式 AI 的 V4 签名与独立服务配置。
        aiStatus: "not_started",
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
