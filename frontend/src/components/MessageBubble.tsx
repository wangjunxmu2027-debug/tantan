"use client";

import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { motion } from "framer-motion";
import { User, Volume2, VolumeX, Loader2 } from "lucide-react";

// TTS API 地址
const TTS_API_URL = process.env.NEXT_PUBLIC_API_URL || "https://xvtgrzavwqesdfcifyrq.supabase.co/functions/v1";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  isLatest?: boolean;
  autoSpeak?: boolean;
  voice?: string; // 声音类型
}

export default function MessageBubble({
  role,
  content,
  isLatest = false,
  autoSpeak = false,
  voice = "chunhou", // 默认醇厚男声
}: MessageBubbleProps) {
  const isAssistant = role === "assistant";
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 自动朗读最新的 AI 消息
  useEffect(() => {
    if (isAssistant && isLatest && autoSpeak && content) {
      const timer = setTimeout(() => {
        speak();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isAssistant, isLatest, autoSpeak, content]);

  // 清理音频
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // 清理 Markdown 标记
  const cleanText = (text: string) => {
    return text
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/#{1,6}\s/g, '')
      .replace(/\n{2,}/g, '。')
      .replace(/\n/g, '，')
      .trim();
  };

  // 使用高质量 TTS 朗读文本
  const speak = async () => {
    // 停止当前播放
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    window.speechSynthesis?.cancel();

    setIsLoading(true);
    
    const cleanedText = cleanText(content);
    
    try {
      // 调用 TTS API
      const response = await fetch(`${TTS_API_URL}/tts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          text: cleanedText,
          voice: voice, // 使用选择的声音
        }),
      });

      // 检查响应类型
      const contentType = response.headers.get("content-type") || "";
      
      // 如果是 JSON 响应，说明需要 fallback
      if (contentType.includes("application/json")) {
        const data = await response.json();
        if (data.fallback || data.error) {
          console.log("TTS API 返回 fallback，使用浏览器 TTS");
          setIsLoading(false);
          fallbackSpeak(cleanedText);
          return;
        }
      }

      if (!response.ok) {
        throw new Error("TTS 请求失败");
      }

      // 获取音频数据
      const audioBlob = await response.blob();
      
      // 检查音频大小（太小说明有问题）
      if (audioBlob.size < 100) {
        console.log("音频数据太小，使用浏览器 TTS");
        setIsLoading(false);
        fallbackSpeak(cleanedText);
        return;
      }
      
      const audioUrl = URL.createObjectURL(audioBlob);
      
      // 创建音频元素播放
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      
      audio.onplay = () => {
        setIsSpeaking(true);
        setIsLoading(false);
      };
      
      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
      };
      
      audio.onerror = () => {
        console.error("音频播放错误");
        setIsSpeaking(false);
        setIsLoading(false);
        URL.revokeObjectURL(audioUrl);
        // 降级到浏览器 TTS
        fallbackSpeak(cleanedText);
      };

      await audio.play();
      
    } catch (error) {
      console.error("TTS 错误:", error);
      setIsLoading(false);
      // 降级到浏览器 TTS
      fallbackSpeak(cleanedText);
    }
  };

  // 降级方案：浏览器内置 TTS
  const fallbackSpeak = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 1.1;
    
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    
    window.speechSynthesis.speak(utterance);
  };

  // 停止朗读
  const stopSpeak = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
    setIsLoading(false);
  };

  return (
    <div
      className={`flex items-start gap-3 ${
        isAssistant ? "" : "flex-row-reverse"
      }`}
    >
      {/* 头像 */}
      <div
        className={`
          w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden
          ${isAssistant ? "" : "bg-gray-200"}
        `}
      >
        {isAssistant ? (
          <img 
            src="/tantan-avatar.png" 
            alt="探探" 
            className="w-full h-full object-cover"
          />
        ) : (
          <img 
            src="/user-avatar.png" 
            alt="用户" 
            className="w-full h-full object-cover"
          />
        )}
      </div>

      {/* 消息气泡 */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`
          message-bubble
          max-w-[75%] rounded-2xl px-4 py-3 shadow-sm
          ${
            isAssistant
              ? "bg-white text-gray-800"
              : "gradient-bg text-white"
          }
        `}
      >
        {isAssistant ? (
          <div className="markdown-content text-sm leading-relaxed">
            <ReactMarkdown
              components={{
                // 自定义链接样式
                a: ({ children, href }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 hover:underline"
                  >
                    {children}
                  </a>
                ),
                // 自定义段落
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                // 自定义列表
                ul: ({ children }) => (
                  <ul className="list-disc list-inside mb-2">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal list-inside mb-2">{children}</ol>
                ),
                // 自定义强调
                strong: ({ children }) => (
                  <strong className="font-semibold text-indigo-700">
                    {children}
                  </strong>
                ),
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        ) : (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">
            {content}
          </p>
        )}
      </motion.div>

      {/* AI 消息的语音播放按钮 */}
      {isAssistant && (
        <button
          onClick={isSpeaking || isLoading ? stopSpeak : speak}
          disabled={isLoading}
          className={`
            self-start mt-1 p-1.5 rounded-full transition-all duration-200 flex-shrink-0
            ${isSpeaking 
              ? 'bg-purple-100 text-purple-600' 
              : isLoading
                ? 'bg-gray-100 text-gray-400'
                : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'
            }
          `}
          title={isLoading ? '加载中...' : isSpeaking ? '停止播放' : '播放语音'}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isSpeaking ? (
            <Volume2 className="w-4 h-4 animate-pulse" />
          ) : (
            <Volume2 className="w-4 h-4" />
          )}
        </button>
      )}
    </div>
  );
}

