"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Loader2 } from "lucide-react";

interface VoiceInputProps {
  onResult: (transcript: string) => void;
  disabled?: boolean;
}

// 声明 SpeechRecognition 类型
interface ISpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: ((this: ISpeechRecognition, ev: Event) => void) | null;
  onend: ((this: ISpeechRecognition, ev: Event) => void) | null;
  onerror: ((this: ISpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
  onresult: ((this: ISpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item: (index: number) => SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item: (index: number) => SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

declare global {
  interface Window {
    SpeechRecognition: new () => ISpeechRecognition;
    webkitSpeechRecognition: new () => ISpeechRecognition;
  }
}

export default function VoiceInput({ onResult, disabled = false }: VoiceInputProps) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [showUnsupportedTip, setShowUnsupportedTip] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const recognitionRef = useRef<ISpeechRecognition | null>(null);

  // 检查浏览器支持
  useEffect(() => {
    // 检测是否在微信浏览器或其他不支持的环境
    const isWechat = /MicroMessenger/i.test(navigator.userAgent);
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    
    // iOS Safari 和微信内置浏览器通常不支持
    const supported = !!SpeechRecognition && !isWechat;
    setIsSupported(supported);

    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = "zh-CN";

      recognitionRef.current.onstart = () => {
        setIsListening(true);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
        setInterimTranscript("");
      };

      recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error("语音识别错误:", event.error);
        setIsListening(false);
        setInterimTranscript("");
      };

      recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
        let finalTranscript = "";
        let interimText = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript;
          } else {
            interimText += result[0].transcript;
          }
        }

        setInterimTranscript(interimText);

        if (finalTranscript) {
          onResult(finalTranscript);
          setInterimTranscript("");
        }
      };
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [onResult]);

  // 切换录音状态
  const toggleListening = useCallback(() => {
    if (!recognitionRef.current || disabled) return;

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      try {
        recognitionRef.current.start();
      } catch (error) {
        console.error("启动语音识别失败:", error);
      }
    }
  }, [isListening, disabled]);

  // 处理不支持时的点击
  const handleUnsupportedClick = () => {
    setShowUnsupportedTip(true);
    setTimeout(() => setShowUnsupportedTip(false), 3000);
  };

  return (
    <div className="relative">
      {/* 麦克风按钮 */}
      <motion.button
        onClick={isSupported ? toggleListening : handleUnsupportedClick}
        disabled={disabled}
        whileHover={{ scale: disabled ? 1 : 1.05 }}
        whileTap={{ scale: disabled ? 1 : 0.95 }}
        className={`
          w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center
          transition-all duration-300 flex-shrink-0
          ${
            isListening
              ? "bg-red-500 recording-pulse"
              : isSupported
              ? "bg-gray-100 hover:bg-gray-200"
              : "bg-gray-100 opacity-60"
          }
          ${disabled ? "opacity-50 cursor-not-allowed" : ""}
        `}
        title={isListening ? "点击停止录音" : isSupported ? "点击开始语音输入" : "当前浏览器不支持语音输入"}
      >
        {isListening ? (
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
        {isListening && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap"
          >
            <div className="bg-gray-800 text-white text-xs px-3 py-1.5 rounded-lg flex items-center gap-2">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span>正在聆听...</span>
            </div>
            {/* 小三角 */}
            <div className="absolute left-1/2 -translate-x-1/2 top-full">
              <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 临时识别结果 */}
      <AnimatePresence>
        {interimTranscript && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute bottom-full left-0 mb-12 w-64"
          >
            <div className="bg-white shadow-lg rounded-lg p-3 border">
              <div className="flex items-center gap-2 text-gray-500 mb-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span className="text-xs">识别中...</span>
              </div>
              <p className="text-sm text-gray-700">{interimTranscript}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

