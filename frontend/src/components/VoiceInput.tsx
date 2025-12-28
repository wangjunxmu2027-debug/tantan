"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Loader2 } from "lucide-react";

interface VoiceInputProps {
  onResult: (transcript: string) => void;
  disabled?: boolean;
}

// ASR API 地址
const ASR_API_URL = process.env.NEXT_PUBLIC_API_URL || "https://xvtgrzavwqesdfcifyrq.supabase.co/functions/v1";

export default function VoiceInput({ onResult, disabled = false }: VoiceInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [showUnsupportedTip, setShowUnsupportedTip] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // 检查浏览器支持
  useEffect(() => {
    const supported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    setIsSupported(supported);
  }, []);

  // 清理资源
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  // 将音频 Blob 转换为 Base64
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        // 移除 data:audio/webm;base64, 前缀
        const base64Data = base64.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // 调用火山引擎 ASR 服务
  const recognizeSpeech = async (audioBlob: Blob): Promise<string> => {
    try {
      setIsProcessing(true);
      
      // 转换为 Base64
      const audioBase64 = await blobToBase64(audioBlob);
      
      console.log("调用火山引擎 ASR，音频大小:", audioBlob.size, "bytes");
      
      // 调用 ASR API
      const response = await fetch(`${ASR_API_URL}/asr`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          audio: audioBase64,
          format: "webm", // 浏览器录音格式
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("ASR API 错误响应:", errorText);
        throw new Error(`ASR 请求失败: ${response.status}`);
      }

      const data = await response.json();
      console.log("ASR 响应:", data);
      
      if (!data.success || !data.text) {
        throw new Error(data.error || "识别失败");
      }

      return data.text;
    } catch (error) {
      console.error("火山引擎 ASR 错误:", error);
      throw error;
    } finally {
      setIsProcessing(false);
    }
  };

  // 降级方案：使用浏览器原生 Web Speech API（实时识别）
  const useBrowserSpeechRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      console.error("浏览器不支持语音识别");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      console.log("浏览器语音识别已启动");
      setIsRecording(true);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      console.log("识别结果:", transcript);
      if (transcript) {
        onResult(transcript);
      }
    };

    recognition.onerror = (event: any) => {
      console.error("识别错误:", event.error);
      setIsRecording(false);
    };

    recognition.onend = () => {
      console.log("识别结束");
      setIsRecording(false);
    };

    try {
      recognition.start();
    } catch (error) {
      console.error("启动识别失败:", error);
      setIsRecording(false);
    }
  };

  // 开始录音
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        } 
      });

      // 创建 MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // 停止所有音轨
        stream.getTracks().forEach(track => track.stop());
        
        // 合并音频数据
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        
        // 检查音频大小
        if (audioBlob.size < 1000) {
          console.warn("录音时间太短");
          setIsRecording(false);
          return;
        }

        try {
          // 优先使用火山引擎 ASR
          const text = await recognizeSpeech(audioBlob);
          if (text) {
            onResult(text);
          }
        } catch (error) {
          console.error("火山引擎识别失败:", error);
          // 显示错误提示
          alert("语音识别服务暂时不可用，请稍后重试");
        }
        
        setIsRecording(false);
        setRecordingTime(0);
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      
      // 开始计时
      let time = 0;
      timerRef.current = setInterval(() => {
        time += 1;
        setRecordingTime(time);
        
        // 最长录音 60 秒
        if (time >= 60) {
          stopRecording();
        }
      }, 1000);

    } catch (error) {
      console.error("启动录音失败:", error);
      setShowUnsupportedTip(true);
      setTimeout(() => setShowUnsupportedTip(false), 3000);
    }
  };

  // 停止录音
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // 切换录音状态
  const toggleRecording = useCallback(() => {
    if (disabled || isProcessing) return;

    if (isRecording) {
      stopRecording();
    } else {
      // 暂时使用浏览器原生识别（因为火山引擎需要在 Supabase 配置密钥）
      // 如果需要使用火山引擎，请在 Supabase Dashboard 配置环境变量：
      // VOLC_TTS_APP_ID 和 VOLC_TTS_TOKEN
      const USE_BROWSER_NATIVE = true; // 改为 false 使用火山引擎
      
      if (USE_BROWSER_NATIVE) {
        useBrowserSpeechRecognition();
      } else {
        startRecording();
      }
    }
  }, [isRecording, disabled, isProcessing]);

  // 处理不支持时的点击
  const handleUnsupportedClick = () => {
    setShowUnsupportedTip(true);
    setTimeout(() => setShowUnsupportedTip(false), 3000);
  };

  // 格式化录音时间
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="relative">
      {/* 麦克风按钮 */}
      <motion.button
        onClick={isSupported ? toggleRecording : handleUnsupportedClick}
        disabled={disabled || isProcessing}
        whileHover={{ scale: disabled || isProcessing ? 1 : 1.05 }}
        whileTap={{ scale: disabled || isProcessing ? 1 : 0.95 }}
        className={`
          w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center
          transition-all duration-300 flex-shrink-0
          ${
            isRecording
              ? "bg-red-500 recording-pulse"
              : isProcessing
              ? "bg-gray-300"
              : isSupported
              ? "bg-gray-100 hover:bg-gray-200"
              : "bg-gray-100 opacity-60"
          }
          ${disabled || isProcessing ? "opacity-50 cursor-not-allowed" : ""}
        `}
        title={
          isProcessing 
            ? "识别中..." 
            : isRecording 
            ? "点击停止录音" 
            : isSupported 
            ? "点击开始语音输入" 
            : "当前浏览器不支持语音输入"
        }
      >
        {isProcessing ? (
          <Loader2 className="w-4 h-4 md:w-5 md:h-5 text-gray-600 animate-spin" />
        ) : isRecording ? (
          <Mic className="w-4 h-4 md:w-5 md:h-5 text-white" />
        ) : isSupported ? (
          <Mic className="w-4 h-4 md:w-5 md:h-5 text-gray-600" />
        ) : (
          <MicOff className="w-4 h-4 md:w-5 md:h-5 text-gray-400" />
        )}
      </motion.button>

      {/* 不支持提示 */}
      <AnimatePresence>
        {showUnsupportedTip && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap z-50"
          >
            <div className="bg-gray-800 text-white text-xs px-3 py-2 rounded-lg">
              当前浏览器不支持语音输入
              <br />
              <span className="text-gray-400">请使用Chrome浏览器</span>
            </div>
            <div className="absolute left-1/2 -translate-x-1/2 top-full">
              <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 录音中提示 */}
      <AnimatePresence>
        {isRecording && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap"
          >
            <div className="bg-gray-800 text-white text-xs px-3 py-1.5 rounded-lg flex items-center gap-2">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span>正在录音 {formatTime(recordingTime)}</span>
            </div>
            {/* 小三角 */}
            <div className="absolute left-1/2 -translate-x-1/2 top-full">
              <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 识别中提示 */}
      <AnimatePresence>
        {isProcessing && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap"
          >
            <div className="bg-white shadow-lg rounded-lg px-3 py-2 border flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin text-indigo-600" />
              <span className="text-xs text-gray-700">识别中...</span>
            </div>
            <div className="absolute left-1/2 -translate-x-1/2 top-full">
              <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-white" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

