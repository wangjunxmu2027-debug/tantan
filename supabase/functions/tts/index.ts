import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, jsonResponse, errorResponse } from "../_shared/cors.ts";

// 火山引擎 TTS 配置
const ACCESS_KEY = Deno.env.get("VOLC_ACCESS_KEY") || "";
const SECRET_KEY = Deno.env.get("VOLC_SECRET_KEY") || "";
const TTS_APP_ID = Deno.env.get("VOLC_TTS_APP_ID") || "";

// 音色配置 - 火山引擎大模型语音合成
const VOICE_TYPES: Record<string, string> = {
  "qingxin": "zh_female_qingxin",      // 清新女声
  "tianmei": "zh_female_tianmei",      // 甜美女声
  "sichuan": "zh_female_sichuan",      // 四川女声
  "chunhou": "zh_male_chunhou",        // 醇厚男声
  "default": "zh_female_qingxin",
};

// HMAC-SHA256 签名
async function hmacSha256(key: Uint8Array, message: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
  return new Uint8Array(signature);
}

// SHA256 哈希
async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// 生成火山引擎 API 签名
async function generateVolcSignature(
  secretKey: string,
  date: string,
  region: string,
  service: string,
  stringToSign: string
): Promise<string> {
  const encoder = new TextEncoder();
  
  // 1. kDate = HMAC_SHA256("VOLC" + SecretKey, Date)
  const kDate = await hmacSha256(encoder.encode("VOLC" + secretKey), date);
  
  // 2. kRegion = HMAC_SHA256(kDate, Region)
  const kRegion = await hmacSha256(kDate, region);
  
  // 3. kService = HMAC_SHA256(kRegion, Service)
  const kService = await hmacSha256(kRegion, service);
  
  // 4. kSigning = HMAC_SHA256(kService, "request")
  const kSigning = await hmacSha256(kService, "request");
  
  // 5. Signature = HexEncode(HMAC_SHA256(kSigning, StringToSign))
  const signature = await hmacSha256(kSigning, stringToSign);
  
  return Array.from(signature)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// 调用火山引擎语音合成 API（大模型版）
async function synthesizeSpeechVolcengine(
  text: string,
  voiceType: string = "default"
): Promise<ArrayBuffer> {
  const voice = VOICE_TYPES[voiceType] || VOICE_TYPES["default"];
  
  // 使用火山引擎语音合成 HTTP API
  // 文档: https://www.volcengine.com/docs/6561/79823
  const host = "openspeech.bytedance.com";
  const path = "/api/v1/tts";
  const url = `https://${host}${path}`;
  
  const requestBody = {
    app: {
      appid: TTS_APP_ID,
      token: "access_token",
      cluster: "volcano_tts"
    },
    user: {
      uid: "tantan_user_" + Date.now()
    },
    audio: {
      voice_type: voice,
      encoding: "mp3",
      speed_ratio: 1.0,
      volume_ratio: 1.0,
      pitch_ratio: 1.0
    },
    request: {
      reqid: crypto.randomUUID(),
      text: text,
      text_type: "plain",
      operation: "query",
      with_frontend: 1,
      frontend_type: "unitTson"
    }
  };

  const bodyStr = JSON.stringify(requestBody);
  
  console.log("调用火山引擎 TTS API:", { appid: TTS_APP_ID, voice, textLength: text.length });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer;${ACCESS_KEY}`
    },
    body: bodyStr
  });

  const result = await response.json();
  console.log("火山引擎 TTS 响应:", { code: result.code, message: result.message });

  if (result.code !== 3000) {
    throw new Error(`TTS 合成失败: ${result.message || result.code}`);
  }

  // 解码 Base64 音频数据
  const audioData = result.data;
  const binaryString = atob(audioData);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  return bytes.buffer;
}

// 备用方案：使用免费的 TTS 服务
async function synthesizeSpeechFree(text: string): Promise<ArrayBuffer> {
  // 使用 VoiceRSS 免费 API（每天限量）
  const apiKey = "demo"; // 免费 demo key
  const url = `https://api.voicerss.org/?key=${apiKey}&hl=zh-cn&src=${encodeURIComponent(text)}&c=MP3`;
  
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`VoiceRSS API 失败: ${response.status}`);
  }
  
  return await response.arrayBuffer();
}

// 最简单的备用方案：返回空音频让前端降级到浏览器 TTS
function createEmptyAudio(): ArrayBuffer {
  // 返回一个最小的有效 MP3 文件（静音）
  // 这会触发前端的 fallback 逻辑
  const emptyMp3 = new Uint8Array([
    0xFF, 0xFB, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);
  return emptyMp3.buffer;
}

Deno.serve(async (req: Request) => {
  // 处理 CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, voice = "default" } = await req.json();

    if (!text) {
      return errorResponse("缺少文本参数", 400);
    }

    // 限制文本长度
    const truncatedText = text.substring(0, 500);
    
    let audioBuffer: ArrayBuffer;
    
    // 检查是否配置了火山引擎 TTS
    if (TTS_APP_ID && ACCESS_KEY) {
      try {
        console.log("尝试使用火山引擎 TTS");
        audioBuffer = await synthesizeSpeechVolcengine(truncatedText, voice);
      } catch (volcError) {
        console.error("火山引擎 TTS 失败:", volcError);
        // 返回错误信息，让前端降级到浏览器 TTS
        return jsonResponse({ 
          error: "TTS 暂时不可用，请使用浏览器语音",
          fallback: true 
        });
      }
    } else {
      console.log("未配置火山引擎 TTS，返回降级提示");
      return jsonResponse({ 
        error: "TTS 未配置",
        fallback: true 
      });
    }

    // 返回音频数据
    return new Response(audioBuffer, {
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.byteLength.toString(),
      },
    });

  } catch (err) {
    console.error("TTS 错误:", err);
    // 返回 JSON 错误，让前端降级
    return jsonResponse({ 
      error: `语音合成失败: ${err instanceof Error ? err.message : String(err)}`,
      fallback: true 
    });
  }
});
