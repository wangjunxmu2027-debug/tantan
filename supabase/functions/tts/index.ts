import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, jsonResponse, errorResponse } from "../_shared/cors.ts";

// 火山引擎 TTS 配置
const ACCESS_KEY = Deno.env.get("VOLC_ACCESS_KEY") || "";
const SECRET_KEY = Deno.env.get("VOLC_SECRET_KEY") || "";

// TTS API 配置
const TTS_APP_ID = Deno.env.get("VOLC_TTS_APP_ID") || ""; 
const TTS_CLUSTER = "volcano_tts";

// 音色配置
const VOICE_TYPES: Record<string, string> = {
  "qingxin": "zh_female_qingxin",      // 清新女声
  "tianmei": "zh_female_tianmei",      // 甜美女声
  "wanwan": "zh_female_wanwan",        // 湾湾小姐姐
  "chunhou": "zh_male_chunhou",        // 醇厚男声
  "default": "zh_female_qingxin",      // 默认清新女声
};

// 生成火山引擎签名
async function generateSignature(
  accessKey: string,
  secretKey: string,
  method: string,
  path: string,
  timestamp: string,
  body: string
): Promise<string> {
  const stringToSign = `${method}\n${path}\n${timestamp}\n${body}`;
  
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secretKey);
  const messageData = encoder.encode(stringToSign);
  
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
  const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
  
  return signatureBase64;
}

// 调用火山引擎 TTS API
async function synthesizeSpeech(
  text: string,
  voiceType: string = "default"
): Promise<ArrayBuffer> {
  const voice = VOICE_TYPES[voiceType] || VOICE_TYPES["default"];
  
  // 使用火山引擎大模型语音合成 API
  const apiUrl = "https://openspeech.bytedance.com/api/v1/tts";
  
  const requestBody = {
    app: {
      appid: TTS_APP_ID,
      token: "access_token", // 会被替换
      cluster: TTS_CLUSTER,
    },
    user: {
      uid: "tantan_user",
    },
    audio: {
      voice_type: voice,
      encoding: "mp3",
      speed_ratio: 1.0,
      volume_ratio: 1.0,
      pitch_ratio: 1.0,
    },
    request: {
      reqid: crypto.randomUUID(),
      text: text,
      text_type: "plain",
      operation: "query",
      with_frontend: 1,
      frontend_type: "unitTson",
    },
  };

  const timestamp = new Date().toISOString();
  const bodyStr = JSON.stringify(requestBody);
  
  // 简化版本：直接使用 Bearer Token 方式
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer;${ACCESS_KEY}`,
    },
    body: bodyStr,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("TTS API 错误:", response.status, errorText);
    throw new Error(`TTS API 调用失败: ${response.status}`);
  }

  const result = await response.json();
  
  if (result.code !== 3000) {
    console.error("TTS 响应错误:", result);
    throw new Error(`TTS 合成失败: ${result.message || "未知错误"}`);
  }

  // 返回 Base64 编码的音频数据
  const audioData = result.data;
  const binaryString = atob(audioData);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  return bytes.buffer;
}

// 备用方案：使用 Edge TTS（微软免费 TTS）
async function synthesizeSpeechEdge(text: string): Promise<ArrayBuffer> {
  // 使用 Edge TTS API（免费且音质不错）
  const voice = "zh-CN-XiaoxiaoNeural"; // 晓晓 - 自然的中文女声
  
  const url = `https://api.edgetts.com/api/tts?voice=${encodeURIComponent(voice)}&text=${encodeURIComponent(text)}`;
  
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Edge TTS 调用失败: ${response.status}`);
  }
  
  return await response.arrayBuffer();
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
    
    try {
      // 优先使用火山引擎 TTS
      if (TTS_APP_ID && ACCESS_KEY) {
        console.log("使用火山引擎 TTS");
        audioBuffer = await synthesizeSpeech(truncatedText, voice);
      } else {
        // 备用方案：Edge TTS
        console.log("使用 Edge TTS（备用）");
        audioBuffer = await synthesizeSpeechEdge(truncatedText);
      }
    } catch (ttsError) {
      console.error("主 TTS 失败，尝试备用:", ttsError);
      // 失败时使用备用方案
      audioBuffer = await synthesizeSpeechEdge(truncatedText);
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
    return errorResponse(`语音合成失败: ${err instanceof Error ? err.message : String(err)}`);
  }
});

