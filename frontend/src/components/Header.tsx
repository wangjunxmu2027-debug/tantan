"use client";

import { motion } from "framer-motion";
import Image from "next/image";

interface HeaderProps {
  isOnline: boolean;
}

export default function Header({ isOnline }: HeaderProps) {
  return (
    <header className="bg-white shadow-sm sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* Logo和标题 */}
        <div className="flex items-center gap-3">
          {/* Logo */}
          <Image
            src="/logo.png"
            alt="Logo"
            width={32}
            height={32}
            className="rounded-lg"
          />
          <div>
            <h1 className="text-lg font-semibold text-gray-800">
              AI调研助手 - 探探
            </h1>
          </div>
        </div>

        {/* 在线状态 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-full"
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isOnline ? "bg-green-500" : "bg-gray-400"
            }`}
          />
          <span className="text-sm text-gray-600">
            {isOnline ? "在线" : "未连接"}
          </span>
        </motion.div>
      </div>
    </header>
  );
}

