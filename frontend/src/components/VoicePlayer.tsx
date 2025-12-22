"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Volume2, VolumeX, Loader2 } from "lucide-react";

interface VoicePlayerProps {
  text: string;
  autoPlay?: boolean;
  onStart?: () => void;
  onEnd?: () => void;
}

export default function VoicePlayer({ 
  text, 
  autoPlay = true,
  onStart,
  onEnd 
}: VoicePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // 检查浏览器支持
  useEffect(() => {
    setIsSupported('speechSynthesis' in window);
  }, []);

  // 清理 Markdown 标记
  const cleanText = useCallback((rawText: string) => {
    return rawText
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/#{1,6}\s/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/`[^`]+`/g, '')
      .replace(/\n{2,}/g, '。')
      .replace(/\n/g, '，')
      .trim();
  }, []);

  // 播放语音
  const speak = useCallback(() => {
    if (!isSupported || !text) return;

    // 停止当前播放
    window.speechSynthesis.cancel();

    const cleanedText = cleanText(text);
    const utterance = new SpeechSynthesisUtterance(cleanedText);
    utteranceRef.current = utterance;

    // 配置语音参数
    utterance.lang = 'zh-CN';
    utterance.rate = 1.1; // 稍快一点
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // 选择中文语音
    const voices = window.speechSynthesis.getVoices();
    const zhVoice = voices.find(v => 
      v.lang.includes('zh-CN') || v.lang.includes('zh_CN')
    );
    if (zhVoice) {
      utterance.voice = zhVoice;
    }

    // 事件处理
    utterance.onstart = () => {
      setIsPlaying(true);
      onStart?.();
    };

    utterance.onend = () => {
      setIsPlaying(false);
      onEnd?.();
    };

    utterance.onerror = (event) => {
      console.error('语音合成错误:', event);
      setIsPlaying(false);
    };

    window.speechSynthesis.speak(utterance);
  }, [text, isSupported, cleanText, onStart, onEnd]);

  // 停止播放
  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsPlaying(false);
  }, []);

  // 自动播放
  useEffect(() => {
    if (autoPlay && text && isSupported) {
      // 延迟一点播放，等待语音列表加载
      const timer = setTimeout(() => {
        speak();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [text, autoPlay, isSupported, speak]);

  // 组件卸载时停止播放
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  if (!isSupported) {
    return null;
  }

  return (
    <button
      onClick={isPlaying ? stop : speak}
      className={`
        p-1.5 rounded-full transition-all duration-200
        ${isPlaying 
          ? 'bg-purple-100 text-purple-600' 
          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
        }
      `}
      title={isPlaying ? '停止播放' : '播放语音'}
    >
      {isPlaying ? (
        <Volume2 className="w-4 h-4 animate-pulse" />
      ) : (
        <Volume2 className="w-4 h-4" />
      )}
    </button>
  );
}

// 全局语音控制 Hook
export function useVoicePlayer() {
  const [isEnabled, setIsEnabled] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const speak = useCallback((text: string) => {
    if (!isEnabled || !('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();

    const cleanedText = text
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
  }, [isEnabled]);

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  const toggle = useCallback(() => {
    if (isSpeaking) {
      stop();
    }
    setIsEnabled(prev => !prev);
  }, [isSpeaking, stop]);

  return {
    isEnabled,
    isSpeaking,
    speak,
    stop,
    toggle,
    setIsEnabled,
  };
}

