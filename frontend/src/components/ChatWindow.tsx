"use client";

import { useState, useRef, useEffect, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2, Volume2, VolumeX, Phone, ChevronDown } from "lucide-react";
import MessageBubble from "./MessageBubble";
import VoiceInput from "./VoiceInput";
import { type Message } from "@/lib/api";

// 懒加载 RTC 组件（暂时保留）
const RTCVoiceChat = lazy(() => import("./RTCVoiceChat"));

// 可选的声音列表
const VOICE_OPTIONS = [
  { value: "xinwen", label: "新闻男声", icon: "📺" },
  { value: "jilupian", label: "纪录片男声", icon: "🎬" },
  { value: "chunhou", label: "醇厚男声", icon: "🎙️" },
  { value: "nansheng", label: "阳光男声", icon: "👨" },
  { value: "nvsheng", label: "温柔女声", icon: "👩" },
  { value: "qingxin", label: "清新女声", icon: "🌸" },
];

interface ChatWindowProps {
  messages: Message[];
  onSendMessage: (content: string) => void;
  isLoading: boolean;
  stage: string;
  sessionId?: string; // 添加 sessionId 用于 RTC
  onVoiceCallOpen?: () => void; // 打开语音通话回调
  onVoiceChange?: (voice: string) => void; // 声音变化回调
}

export default function ChatWindow({
  messages,
  onSendMessage,
  isLoading,
  stage,
  sessionId,
  onVoiceCallOpen,
  onVoiceChange,
}: ChatWindowProps) {
  const [inputValue, setInputValue] = useState("");
  const [autoSpeak, setAutoSpeak] = useState(true); // 自动朗读开关
  const [selectedVoice, setSelectedVoice] = useState("xinwen"); // 默认新闻男声
  const [showVoiceMenu, setShowVoiceMenu] = useState(false); // 是否显示声音选择菜单
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const voiceMenuRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 点击外部关闭声音菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (voiceMenuRef.current && !voiceMenuRef.current.contains(event.target as Node)) {
        setShowVoiceMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 发送消息
  const handleSend = () => {
    if (!inputValue.trim() || isLoading) return;
    onSendMessage(inputValue.trim());
    setInputValue("");
  };

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 处理语音输入结果
  const handleVoiceResult = (transcript: string) => {
    setInputValue((prev) => prev + transcript);
    inputRef.current?.focus();
  };

  // 判断是否完成
  const isCompleted = stage === "completed";

  return (
    <div className="flex-1 flex flex-col w-full">
      {/* 消息列表区域 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-4xl mx-auto w-full">
        <AnimatePresence initial={false}>
          {messages.map((message, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <MessageBubble
                role={message.role}
                content={message.content}
                isLatest={index === messages.length - 1}
                autoSpeak={autoSpeak}
                voice={selectedVoice}
              />
            </motion.div>
          ))}
        </AnimatePresence>

        {/* 加载状态 */}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-3 px-4"
          >
            <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center">
              <img 
                src="/tantan-avatar.png" 
                alt="探探" 
                className="w-full h-full object-cover"
              />
            </div>
            <div className="bg-white rounded-2xl px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2 text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">探探正在思考...</span>
              </div>
            </div>
          </motion.div>
        )}

        {/* 完成提示 */}
        {isCompleted && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-6"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-full text-sm">
              <span>✓</span>
              <span>访谈已完成</span>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 输入区域 */}
      <div className="border-t bg-white p-3 md:p-4 w-full safe-area-bottom">
        <div className="max-w-5xl mx-auto px-2 md:px-8">
          <div className="flex items-center gap-2 md:gap-3">
            {/* 语音输入按钮 */}
            <VoiceInput onResult={handleVoiceResult} disabled={isCompleted} />

            {/* 声音选择 + 自动朗读开关 */}
            <div className="relative" ref={voiceMenuRef}>
              <button
                onClick={() => setShowVoiceMenu(!showVoiceMenu)}
                className={`
                  h-10 md:h-12 px-3 rounded-full flex items-center gap-1.5
                  transition-all duration-300 flex-shrink-0
                  ${autoSpeak 
                    ? 'bg-purple-100 text-purple-600 hover:bg-purple-200' 
                    : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                  }
                `}
                title="选择语音音色"
              >
                <span className="text-sm hidden md:inline">
                  {VOICE_OPTIONS.find(v => v.value === selectedVoice)?.icon}
                </span>
                {autoSpeak ? (
                  <Volume2 className="w-4 h-4 md:w-5 md:h-5" />
                ) : (
                  <VolumeX className="w-4 h-4 md:w-5 md:h-5" />
                )}
                <ChevronDown className="w-3 h-3 md:w-4 md:h-4" />
              </button>

              {/* 声音选择下拉菜单 */}
              <AnimatePresence>
                {showVoiceMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    className="absolute bottom-full left-0 mb-2 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50 min-w-[160px]"
                  >
                    {/* 自动朗读开关 */}
                    <div className="px-3 py-2 border-b border-gray-100">
                      <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-sm text-gray-600">自动朗读</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (autoSpeak) {
                              window.speechSynthesis?.cancel();
                            }
                            setAutoSpeak(!autoSpeak);
                          }}
                          className={`
                            w-10 h-5 rounded-full transition-colors relative
                            ${autoSpeak ? 'bg-purple-500' : 'bg-gray-300'}
                          `}
                        >
                          <span 
                            className={`
                              absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform
                              ${autoSpeak ? 'translate-x-5' : 'translate-x-0.5'}
                            `}
                          />
                        </button>
                      </label>
                    </div>

                    {/* 声音选项 */}
                    <div className="py-1">
                      <div className="px-3 py-1.5 text-xs text-gray-400">选择音色</div>
                      {VOICE_OPTIONS.map((voice) => (
                        <button
                          key={voice.value}
                          onClick={() => {
                            setSelectedVoice(voice.value);
                            onVoiceChange?.(voice.value);
                            setShowVoiceMenu(false);
                          }}
                          className={`
                            w-full px-3 py-2 flex items-center gap-2 text-sm
                            transition-colors hover:bg-gray-50
                            ${selectedVoice === voice.value ? 'text-purple-600 bg-purple-50' : 'text-gray-700'}
                          `}
                        >
                          <span>{voice.icon}</span>
                          <span>{voice.label}</span>
                          {selectedVoice === voice.value && (
                            <span className="ml-auto text-purple-500">✓</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* 语音通话按钮 - 打开全屏语音界面 */}
            {sessionId && !isCompleted && onVoiceCallOpen && (
              <button
                onClick={onVoiceCallOpen}
                className={`
                  w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center
                  transition-all duration-300 flex-shrink-0
                  bg-gradient-to-r from-green-400 to-emerald-500 text-white
                  hover:from-green-500 hover:to-emerald-600 shadow-md
                `}
                title="开启语音通话"
              >
                <Phone className="w-4 h-4 md:w-5 md:h-5" />
              </button>
            )}

            {/* 文字输入框 */}
            <div className="flex-1 relative flex items-center">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  isCompleted ? "访谈已结束" : "输入您的回答..."
                }
                disabled={isLoading || isCompleted}
                rows={1}
                className={`
                  w-full px-3 py-2 md:px-4 md:py-3 pr-10 md:pr-12
                  bg-gray-50 rounded-xl md:rounded-2xl
                  border border-gray-200
                  focus:border-indigo-300 focus:bg-white
                  input-focus-ring
                  resize-none
                  transition-all duration-200
                  disabled:opacity-50 disabled:cursor-not-allowed
                  text-gray-800 placeholder-gray-400
                  text-sm md:text-base
                `}
                style={{
                  minHeight: "44px",
                  maxHeight: "100px",
                }}
              />

              {/* 发送按钮 */}
              <button
                onClick={handleSend}
                disabled={!inputValue.trim() || isLoading || isCompleted}
                className={`
                  absolute right-2 md:right-3 top-1/2 -translate-y-1/2
                  w-7 h-7 md:w-8 md:h-8 rounded-full
                  flex items-center justify-center
                  transition-all duration-200
                  ${
                    inputValue.trim() && !isLoading
                      ? "gradient-bg text-white hover:opacity-90"
                      : "bg-gray-200 text-gray-400"
                  }
                  disabled:cursor-not-allowed
                `}
              >
                <Send className="w-3.5 h-3.5 md:w-4 md:h-4" />
              </button>
            </div>
          </div>

          {/* 提示文字 - 移动端隐藏 */}
          <p className="hidden md:block text-xs text-gray-400 mt-2 text-center">
            按 Enter 发送，Shift + Enter 换行 | 支持语音输入
          </p>

        </div>
      </div>
    </div>
  );
}

