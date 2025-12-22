import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, jsonResponse, errorResponse } from "../_shared/cors.ts";

// 火山引擎 TTS 配置
const TTS_APP_ID = Deno.env.get("VOLC_TTS_APP_ID") || "";
const TTS_TOKEN = Deno.env.get("VOLC_TTS_TOKEN") || "";

// 音色配置 - 火山引擎语音合成
// 参考: https://www.volcengine.com/docs/6561/97465
const VOICE_TYPES: Record<string, string> = {
  "qingxin": "BV001_streaming",        // 通用女声
  "tianmei": "BV002_streaming",        // 通用男声
  "sichuan": "BV406_streaming",        // 四川话女声
  "chunhou": "BV002_streaming",        // 醇厚男声
  "default": "BV001_streaming",        // 默认通用女声
};

// 调用火山引擎语音合成 API
async function synthesizeSpeech(text: string, voiceType: string = "default"): Promise<ArrayBuffer> {
  const voice = VOICE_TYPES[voiceType] || VOICE_TYPES["default"];
  
  // 火山引擎大模型语音合成 API
  const url = "https://openspeech.bytedance.com/api/v1/tts";
  
  const requestBody = {
    app: {
      appid: TTS_APP_ID,
      token: TTS_TOKEN,
      cluster: "volcano_tts"  // 标准语音合成
    },
    user: {
      uid: "tantan_" + Date.now()
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

  console.log("火山引擎 TTS 请求:", { appid: TTS_APP_ID, voice, textLength: text.length });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer;${TTS_TOKEN}`
    },
    body: JSON.stringify(requestBody)
  });

  const responseText = await response.text();
  console.log("火山引擎 TTS 原始响应:", responseText.substring(0, 300));

  let result;
  try {
    result = JSON.parse(responseText);
  } catch (e) {
    console.error("解析响应失败:", e);
    throw new Error("TTS 响应解析失败");
  }

  console.log("火山引擎 TTS 响应码:", result.code, result.message);

  // 成功响应码是 3000
  if (result.code !== 3000) {
    throw new Error(`TTS 失败: ${result.message || result.code}`);
  }

  // 解码 Base64 音频数据
  const audioData = result.data;
  if (!audioData) {
    throw new Error("TTS 响应无音频数据");
  }

  const binaryString = atob(audioData);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  console.log("音频数据大小:", bytes.length, "bytes");
  return bytes.buffer;
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
    
    // 检查是否配置了火山引擎 TTS
    if (!TTS_APP_ID || !TTS_TOKEN) {
      console.log("TTS 未配置，返回 fallback");
      return jsonResponse({ 
        error: "TTS 未配置",
        fallback: true 
      });
    }

    try {
      const audioBuffer = await synthesizeSpeech(truncatedText, voice);
      
      // 返回音频数据
      return new Response(audioBuffer, {
        headers: {
          ...corsHeaders,
          "Content-Type": "audio/mpeg",
          "Content-Length": audioBuffer.byteLength.toString(),
        },
      });
    } catch (ttsError) {
      console.error("TTS 合成失败:", ttsError);
      return jsonResponse({ 
        error: `TTS 失败: ${ttsError instanceof Error ? ttsError.message : String(ttsError)}`,
        fallback: true 
      });
    }

  } catch (err) {
    console.error("TTS 错误:", err);
    return jsonResponse({ 
      error: `请求处理失败: ${err instanceof Error ? err.message : String(err)}`,
      fallback: true 
    });
  }
});
