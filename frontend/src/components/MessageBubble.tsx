"use client";

import ReactMarkdown from "react-markdown";
import { motion } from "framer-motion";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
}

export default function MessageBubble({ role, content }: MessageBubbleProps) {
  const isAssistant = role === "assistant";

  return (
    <div className={`flex items-start gap-3 ${isAssistant ? "" : "flex-row-reverse"}`}>
      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden ${isAssistant ? "" : "bg-gray-200"}`}>
        <img
          src={isAssistant ? "/tantan-avatar.png" : "/user-avatar.png"}
          alt={isAssistant ? "探探" : "用户"}
          className="w-full h-full object-cover"
        />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`message-bubble max-w-[75%] rounded-2xl px-4 py-3 shadow-sm ${isAssistant ? "bg-white text-gray-800" : "gradient-bg text-white"}`}
      >
        {isAssistant ? (
          <div className="markdown-content text-sm leading-relaxed">
            <ReactMarkdown
              components={{
                a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">{children}</a>,
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                ul: ({ children }) => <ul className="list-disc list-inside mb-2">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal list-inside mb-2">{children}</ol>,
                strong: ({ children }) => <strong className="font-semibold text-indigo-700">{children}</strong>,
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        ) : (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>
        )}
      </motion.div>
    </div>
  );
}
