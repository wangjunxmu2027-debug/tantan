import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, jsonResponse, errorResponse } from "../_shared/cors.ts";

// 火山引擎 ASR 配置 - 复用 TTS 的配置
const ASR_APP_ID = Deno.env.get("VOLC_TTS_APP_ID") || "";
const ASR_TOKEN = Deno.env.get("VOLC_TTS_TOKEN") || "";

// 调用火山引擎语音识别 API
// 文档: https://www.volcengine.com/docs/6561/80818
async function recognizeSpeech(audioBase64: string, format: string = "wav"): Promise<string> {
  const url = "https://openspeech.bytedance.com/api/v1/asr";
  
  // 火山引擎支持的格式: wav, mp3, ogg, speex, amr, m4a
  // webm 通常使用 opus 编码，映射到 ogg
  let audioFormat = format;
  if (format === "webm" || format === "opus") {
    audioFormat = "ogg";
  } else if (format === "mp4" || format === "m4a") {
    audioFormat = "m4a";
  }
  
  // 一句话识别 cluster 名称
  // 参考文档: https://www.volcengine.com/docs/6561/80818
  const requestBody = {
    app: {
      appid: ASR_APP_ID,
      token: ASR_TOKEN,
      cluster: "volcengine_input_common"  // 一句话识别 通用-中文
    },
    user: {
      uid: "tantan_" + Date.now()
    },
    audio: {
      format: audioFormat,
      rate: 16000,
      bits: 16,
      channel: 1,
      language: "zh-CN"
    },
    request: {
      reqid: crypto.randomUUID(),
      sequence: -1,  // -1 表示一次性识别
      nbest: 1,
      workflow: "audio_in,resample,partition,vad,fe,decode,itn,nlu_punctuate",
      show_utterances: true,
      result_type: "full"
    },
    // 音频数据
    data: audioBase64
  };

  console.log("火山引擎 ASR 请求:", { 
    appid: ASR_APP_ID, 
    format: requestBody.audio.format,
    dataLength: audioBase64.length 
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer;${ASR_TOKEN}`
    },
    body: JSON.stringify(requestBody)
  });

  const responseText = await response.text();
  console.log("火山引擎 ASR 原始响应:", responseText.substring(0, 500));

  let result;
  try {
    result = JSON.parse(responseText);
  } catch (e) {
    console.error("解析响应失败:", e);
    throw new Error("ASR 响应解析失败");
  }

  console.log("火山引擎 ASR 响应码:", result.code, result.message);

  // 检查响应
  if (result.code !== 1000 && result.code !== 0) {
    throw new Error(`ASR 失败: ${result.message || result.code}`);
  }

  // 返回识别结果
  return result.result || result.text || "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 获取音频数据
    const contentType = req.headers.get("content-type") || "";
    
    let audioBase64: string;
    let format = "wav";
    
    if (contentType.includes("application/json")) {
      // JSON 请求体中的 base64 音频
      const body = await req.json();
      audioBase64 = body.audio;
      format = body.format || "wav";
      
      if (!audioBase64) {
        return errorResponse("缺少音频数据", 400);
      }
    } else {
      // 二进制音频数据 - 转换为 base64
      const audioData = await req.arrayBuffer();
      const bytes = new Uint8Array(audioData);
      audioBase64 = btoa(String.fromCharCode(...bytes));
      // 从 content-type 推断格式
      if (contentType.includes("webm")) format = "webm";
      else if (contentType.includes("mp3")) format = "mp3";
      else if (contentType.includes("ogg")) format = "ogg";
    }

    if (!ASR_APP_ID || !ASR_TOKEN) {
      console.warn("火山引擎 ASR 密钥未配置");
      return errorResponse("ASR 服务未配置", 500);
    }

    const text = await recognizeSpeech(audioBase64, format);

    return jsonResponse({
      success: true,
      text: text,
    });

  } catch (err) {
    console.error("ASR 失败:", err);
    return errorResponse(`ASR 失败: ${err instanceof Error ? err.message : String(err)}`);
  }
});
