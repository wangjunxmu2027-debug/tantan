"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2 } from "lucide-react";
import MessageBubble from "./MessageBubble";
import VoiceInput from "./VoiceInput";
import { type Message } from "@/lib/api";

interface ChatWindowProps {
  messages: Message[];
  onSendMessage: (content: string) => void;
  isLoading: boolean;
  stage: string;
}

export default function ChatWindow({
  messages,
  onSendMessage,
  isLoading,
  stage,
}: ChatWindowProps) {
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 自动滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
      <div className="border-t bg-white p-4 w-full">
        <div className="max-w-5xl mx-auto px-8">
          <div className="flex items-center gap-3">
            {/* 语音输入按钮 */}
            <VoiceInput onResult={handleVoiceResult} disabled={isCompleted} />

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
                  w-full px-4 py-3 pr-12
                  bg-gray-50 rounded-2xl
                  border border-gray-200
                  focus:border-indigo-300 focus:bg-white
                  input-focus-ring
                  resize-none
                  transition-all duration-200
                  disabled:opacity-50 disabled:cursor-not-allowed
                  text-gray-800 placeholder-gray-400
                `}
                style={{
                  minHeight: "48px",
                  maxHeight: "120px",
                }}
              />

              {/* 发送按钮 */}
              <button
                onClick={handleSend}
                disabled={!inputValue.trim() || isLoading || isCompleted}
                className={`
                  absolute right-3 top-1/2 -translate-y-1/2
                  w-8 h-8 rounded-full
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
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 提示文字 */}
          <p className="text-xs text-gray-400 mt-2 text-center">
            按 Enter 发送，Shift + Enter 换行 | 支持语音输入
          </p>
        </div>
      </div>
    </div>
  );
}

