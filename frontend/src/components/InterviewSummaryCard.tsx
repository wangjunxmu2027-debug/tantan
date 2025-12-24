"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { 
  User, 
  Building2, 
  Target, 
  MessageCircle, 
  Sparkles,
  Copy,
  Check,
  Share2,
  Download
} from "lucide-react";

interface SummaryData {
  greeting: string;
  profile: {
    scale: string;
    role: string;
    channels: string;
  };
  painPoints: Array<{
    title: string;
    description: string;
  }>;
  quotes: string[];
  closing: string;
}

interface InterviewSummaryCardProps {
  companyName: string;
  interviewerName?: string;
  messages: { role: string; content: string }[];
  onClose?: () => void;
}

// 从对话中提取总结数据
function extractSummaryData(
  messages: { role: string; content: string }[],
  companyName: string,
  interviewerName?: string
): SummaryData {
  const userMessages = messages.filter(m => m.role === "user");
  const allUserContent = userMessages.map(m => m.content).join(" ");
  
  // 提取姓氏
  const getSurname = (name: string) => {
    if (!name) return "";
    const compoundSurnames = ["欧阳", "司马", "上官", "诸葛", "东方", "皇甫"];
    for (const surname of compoundSurnames) {
      if (name.startsWith(surname)) return surname;
    }
    return name.charAt(0);
  };
  
  const honorific = interviewerName ? `${getSurname(interviewerName)}总` : "您";

  // 分析内容提取信息
  const analyzeScale = () => {
    if (allUserContent.includes("大型") || allUserContent.includes("500") || allUserContent.includes("千人")) {
      return "大型企业（500人以上）";
    } else if (allUserContent.includes("中型") || allUserContent.includes("100") || allUserContent.includes("百人")) {
      return "中型企业（50-500人）";
    } else if (allUserContent.includes("小型") || allUserContent.includes("创业") || allUserContent.includes("初创")) {
      return "成长型企业（15-50人）";
    }
    return "成熟团队";
  };

  const analyzeRole = () => {
    if (allUserContent.includes("销售") || allUserContent.includes("市场")) {
      return "销售/市场负责人";
    } else if (allUserContent.includes("运营") || allUserContent.includes("管理")) {
      return "运营管理者";
    } else if (allUserContent.includes("技术") || allUserContent.includes("研发")) {
      return "技术负责人";
    } else if (allUserContent.includes("老板") || allUserContent.includes("创始人") || allUserContent.includes("总经理")) {
      return "企业决策者";
    }
    return "核心业务负责人";
  };

  // 提取痛点
  const extractPainPoints = () => {
    const painPoints: Array<{ title: string; description: string }> = [];
    
    // 关键词映射到管理术语
    const painPointPatterns = [
      { keywords: ["找不到", "查找", "搜索难", "文件"], title: "信息沉淀成本过高", description: '存在"数据孤岛"风险，知识资产难以复用' },
      { keywords: ["沟通", "传达", "通知", "微信"], title: "管理信息衰减", description: "由于依赖即时通讯工具层层转发，政策执行力难以穿透" },
      { keywords: ["效率", "慢", "耗时", "繁琐"], title: "流程效率待优化", description: "重复性工作占用大量时间，存在较大自动化提升空间" },
      { keywords: ["报表", "统计", "数据"], title: "数据决策能力不足", description: "报表产出依赖人工，实时洞察能力受限" },
      { keywords: ["协作", "配合", "部门"], title: "跨部门协同断层", description: "信息流转不畅，协作成本居高不下" },
      { keywords: ["培训", "学习", "新人"], title: "知识传承体系缺失", description: "经验难以沉淀，人才培养周期过长" },
    ];

    for (const pattern of painPointPatterns) {
      if (pattern.keywords.some(k => allUserContent.includes(k))) {
        painPoints.push({ title: pattern.title, description: pattern.description });
      }
      if (painPoints.length >= 3) break;
    }

    // 如果没有匹配到，添加默认痛点
    if (painPoints.length === 0) {
      painPoints.push(
        { title: "业务流程待数字化", description: "核心业务流程仍依赖线下或手工操作，存在效率提升空间" },
        { title: "数据资产未充分利用", description: "业务数据分散在多个系统，难以形成决策支撑" }
      );
    }

    return painPoints;
  };

  // 提取金句
  const extractQuotes = () => {
    const quotes: string[] = [];
    
    // 寻找包含情感或压力表达的句子
    const emotionalPatterns = [
      /(.{10,40}(很难|太难|头疼|烦|累|麻烦|找不到|搞不清|没办法|不得不).{0,20})/g,
      /(.{10,40}(希望|期望|想要|如果能|要是能).{0,30})/g,
      /"([^"]{10,50})"/g,
      /「([^」]{10,50})」/g,
    ];

    for (const msg of userMessages) {
      for (const pattern of emotionalPatterns) {
        const matches = msg.content.matchAll(pattern);
        for (const match of matches) {
          const quote = match[1] || match[0];
          if (quote && quote.length >= 10 && quote.length <= 60 && !quotes.includes(quote)) {
            quotes.push(quote.replace(/^[，。！？、\s]+|[，。！？、\s]+$/g, ""));
            if (quotes.length >= 2) break;
          }
        }
        if (quotes.length >= 2) break;
      }
      if (quotes.length >= 2) break;
    }

    // 默认金句
    if (quotes.length === 0) {
      quotes.push("希望能有更高效的方式来管理日常工作");
    }

    return quotes;
  };

  return {
    greeting: `感谢您刚才的真诚分享！我已为您完成了实时业务诊断。您的经营智慧令我印象深刻，以下是为您生成的数字化复盘：`,
    profile: {
      scale: analyzeScale(),
      role: analyzeRole(),
      channels: `${companyName}核心业务团队`,
    },
    painPoints: extractPainPoints(),
    quotes: extractQuotes(),
    closing: `本报告由 AI调研助手-探探秒级生成，让我们一起开启高效增长之旅！`,
  };
}

export default function InterviewSummaryCard({
  companyName,
  interviewerName,
  messages,
  onClose,
}: InterviewSummaryCardProps) {
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [isGenerating, setIsGenerating] = useState(true);
  const [copied, setCopied] = useState(false);

  // 提取姓氏
  const getSurname = (name: string) => {
    if (!name) return "";
    const compoundSurnames = ["欧阳", "司马", "上官", "诸葛", "东方", "皇甫"];
    for (const surname of compoundSurnames) {
      if (name.startsWith(surname)) return surname;
    }
    return name.charAt(0);
  };

  const honorific = interviewerName ? `${getSurname(interviewerName)}总` : "您";

  useEffect(() => {
    // 模拟生成延迟
    const timer = setTimeout(() => {
      const data = extractSummaryData(messages, companyName, interviewerName);
      setSummaryData(data);
      setIsGenerating(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, [messages, companyName, interviewerName]);

  const handleCopy = async () => {
    if (!summaryData) return;
    
    const text = `尊敬的 ${honorific}：

${summaryData.greeting}

👤 经营画像
• 组织规模：${summaryData.profile.scale}
• 管理角色：${summaryData.profile.role}

🔍 核心痛点洞察
${summaryData.painPoints.map(p => `• ${p.title}：${p.description}`).join('\n')}

🎙️ 您的精彩金句
${summaryData.quotes.map(q => `"${q}"`).join('\n')}

✨ ${summaryData.closing}`;

    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isGenerating) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl p-6 shadow-lg max-w-2xl mx-auto"
      >
        <div className="flex items-center gap-3 text-purple-600">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          >
            <Sparkles className="w-5 h-5" />
          </motion.div>
          <span className="font-medium">正在为您生成调研总结卡片...</span>
        </div>
      </motion.div>
    );
  }

  if (!summaryData) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl shadow-xl overflow-hidden max-w-2xl mx-auto border border-gray-100"
    >
      {/* 头部渐变 */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-4 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            <span className="font-bold">调研总结卡片</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              title="复制"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
            <button
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              title="分享"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 内容区 */}
      <div className="p-6 space-y-6">
        {/* 称呼和开场白 */}
        <div>
          <p className="text-lg font-semibold text-gray-900 mb-2">
            尊敬的 {honorific}：
          </p>
          <p className="text-gray-600 leading-relaxed">
            {summaryData.greeting}
          </p>
        </div>

        {/* 经营画像 */}
        <div className="bg-blue-50 rounded-xl p-4">
          <div className="flex items-center gap-2 text-blue-700 font-semibold mb-3">
            <User className="w-5 h-5" />
            <span>👤 经营画像</span>
          </div>
          <div className="space-y-2 text-gray-700">
            <div className="flex gap-2">
              <span className="text-blue-500">•</span>
              <span><strong>组织规模：</strong>{summaryData.profile.scale}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-blue-500">•</span>
              <span><strong>管理角色：</strong>{summaryData.profile.role}</span>
            </div>
          </div>
        </div>

        {/* 核心痛点洞察 */}
        <div className="bg-orange-50 rounded-xl p-4">
          <div className="flex items-center gap-2 text-orange-700 font-semibold mb-3">
            <Target className="w-5 h-5" />
            <span>🔍 核心痛点洞察</span>
          </div>
          <div className="space-y-3">
            {summaryData.painPoints.map((point, idx) => (
              <div key={idx} className="text-gray-700">
                <div className="flex gap-2 items-start">
                  <span className="text-orange-500 font-bold">•</span>
                  <div>
                    <span className="font-semibold text-orange-800">{point.title}：</span>
                    <span>{point.description}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 金句摘录 */}
        <div className="bg-green-50 rounded-xl p-4">
          <div className="flex items-center gap-2 text-green-700 font-semibold mb-3">
            <MessageCircle className="w-5 h-5" />
            <span>🎙️ 您的精彩金句</span>
          </div>
          <div className="space-y-2">
            {summaryData.quotes.map((quote, idx) => (
              <div
                key={idx}
                className="bg-white rounded-lg px-4 py-2 text-gray-700 italic border-l-4 border-green-400"
              >
                "{quote}"
              </div>
            ))}
          </div>
        </div>

        {/* 结语 */}
        <div className="text-center pt-4 border-t border-gray-100">
          <p className="text-sm text-gray-500 flex items-center justify-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-500" />
            {summaryData.closing}
          </p>
        </div>
      </div>

      {/* 底部操作 */}
      {onClose && (
        <div className="px-6 py-4 bg-gray-50 border-t">
          <button
            onClick={onClose}
            className="w-full py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium transition-colors"
          >
            查看详细分析报告
          </button>
        </div>
      )}
    </motion.div>
  );
}

