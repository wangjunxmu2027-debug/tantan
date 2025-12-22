"use client";

import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { motion } from "framer-motion";
import { User, Volume2, VolumeX } from "lucide-react";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  isLatest?: boolean;
  autoSpeak?: boolean;
}

export default function MessageBubble({
  role,
  content,
  isLatest = false,
  autoSpeak = false,
}: MessageBubbleProps) {
  const isAssistant = role === "assistant";
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [canSpeak, setCanSpeak] = useState(false);

  // 检查是否支持语音合成
  useEffect(() => {
    setCanSpeak('speechSynthesis' in window);
  }, []);

  // 自动朗读最新的 AI 消息
  useEffect(() => {
    if (isAssistant && isLatest && autoSpeak && canSpeak && content) {
      const timer = setTimeout(() => {
        speak();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isAssistant, isLatest, autoSpeak, canSpeak, content]);

  // 朗读文本
  const speak = () => {
    if (!canSpeak) return;
    
    window.speechSynthesis.cancel();
    
    const cleanedText = content
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/#{1,6}\s/g, '')
      .replace(/\n{2,}/g, '。')
      .replace(/\n/g, '，');

    const utterance = new SpeechSynthesisUtterance(cleanedText);
    utterance.lang = 'zh-CN';
    utterance.rate = 1.1;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const zhVoice = voices.find(v => v.lang.includes('zh'));
    if (zhVoice) utterance.voice = zhVoice;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  };

  // 停止朗读
  const stopSpeak = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
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
      {isAssistant && canSpeak && (
        <button
          onClick={isSpeaking ? stopSpeak : speak}
          className={`
            self-start mt-1 p-1.5 rounded-full transition-all duration-200 flex-shrink-0
            ${isSpeaking 
              ? 'bg-purple-100 text-purple-600' 
              : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'
            }
          `}
          title={isSpeaking ? '停止播放' : '播放语音'}
        >
          {isSpeaking ? (
            <Volume2 className="w-4 h-4 animate-pulse" />
          ) : (
            <Volume2 className="w-4 h-4" />
          )}
        </button>
      )}
    </div>
  );
}

