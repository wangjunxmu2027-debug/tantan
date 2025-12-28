"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { 
  FileText, 
  Download, 
  Share2, 
  CheckCircle2, 
  AlertCircle,
  Lightbulb,
  TrendingUp,
  MessageSquare,
  Target,
  Users,
  BarChart3,
  Sparkles
} from "lucide-react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";

// 评估维度
interface Dimension {
  name: string;
  score: number;
  maxScore: number;
  highlights: string[];
  improvements: string[];
  suggestion?: string;
}

// 报告数据
interface ReportData {
  overallScore: number;
  summary: string;
  dimensions: Dimension[];
  keyInsights: string[];
  nextSteps: string[];
}

interface InterviewReportProps {
  sessionId: string;
  companyName: string;
  interviewerName?: string;
  messages: { role: string; content: string }[];
  onClose?: () => void;
}

// 模拟生成报告数据（实际应调用 AI API）
function generateReportData(
  messages: { role: string; content: string }[],
  companyName: string
): ReportData {
  const messageCount = messages.length;
  const userMessages = messages.filter(m => m.role === "user");
  const avgUserMsgLength = userMessages.length > 0 
    ? userMessages.reduce((sum, m) => sum + m.content.length, 0) / userMessages.length 
    : 0;
  
  // 基于对话内容动态计算分数
  const baseScore = Math.min(95, 60 + Math.floor(messageCount * 2) + Math.floor(avgUserMsgLength / 10));
  
  const dimensions: Dimension[] = [
    {
      name: "需求表达清晰度",
      score: Math.min(30, 20 + Math.floor(avgUserMsgLength / 15)),
      maxScore: 30,
      highlights: [
        "能够清晰描述当前业务场景和工作流程",
        "对核心需求有明确的优先级认知",
      ],
      improvements: [
        "部分需求描述可以更加量化，如具体的用户规模、数据量等",
      ],
      suggestion: "建议在后续沟通中提供更多具体的业务数据和指标，以便更精准地匹配解决方案。",
    },
    {
      name: "业务理解深度",
      score: Math.min(25, 18 + Math.floor(messageCount / 3)),
      maxScore: 25,
      highlights: [
        `对${companyName}的业务模式有清晰理解`,
        "能够识别业务流程中的关键节点和痛点",
      ],
      improvements: [
        "可以更深入了解行业竞争格局和差异化需求",
      ],
      suggestion: "建议增加对行业标杆案例的研究，以更好地理解行业最佳实践。",
    },
    {
      name: "痛点识别准确度",
      score: Math.min(20, 14 + Math.floor(userMessages.length / 2)),
      maxScore: 20,
      highlights: [
        "准确识别了效率提升和成本控制的核心痛点",
        "对现有系统的局限性有深刻认识",
      ],
      improvements: [
        "可以进一步挖掘隐性痛点和潜在机会点",
      ],
    },
    {
      name: "方案匹配度",
      score: Math.min(15, 10 + Math.floor(messageCount / 4)),
      maxScore: 15,
      highlights: [
        "推荐的解决方案与业务需求高度契合",
        "考虑了实施的可行性和投入产出比",
      ],
      improvements: [
        "可以提供更多备选方案供参考",
      ],
    },
    {
      name: "沟通互动质量",
      score: Math.min(10, 7 + Math.floor(messageCount / 5)),
      maxScore: 10,
      highlights: [
        "访谈过程流畅，问答互动良好",
        "能够及时澄清疑问和补充信息",
      ],
      improvements: [],
    },
  ];

  const totalScore = dimensions.reduce((sum, d) => sum + d.score, 0);

  return {
    overallScore: totalScore,
    summary: `本次与${companyName}的访谈非常顺利，共进行了${messageCount}轮对话。受访者表现出对业务需求的清晰认知，能够准确描述当前面临的挑战和期望的解决方案。通过深入交流，我们识别了多个核心痛点，包括工作效率提升、数据整合优化等关键领域。建议后续重点关注方案的落地实施和持续优化。`,
    dimensions,
    keyInsights: [
      `${companyName}在数字化转型方面有明确的战略规划`,
      "团队对新技术和工具的接受度较高",
      "存在明确的效率提升空间和成本优化机会",
      "对数据安全和隐私保护有较高要求",
    ],
    nextSteps: [
      "整理详细的需求规格文档，明确功能优先级",
      "安排技术团队进行方案可行性评估",
      "准备定制化的Demo演示，针对核心场景",
      "制定分阶段的实施路线图和里程碑",
    ],
  };
}

export default function InterviewReport({
  sessionId,
  companyName,
  interviewerName,
  messages,
  onClose,
}: InterviewReportProps) {
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [isGenerating, setIsGenerating] = useState(true);

  useEffect(() => {
    // 模拟生成报告的延迟
    const timer = setTimeout(() => {
      const data = generateReportData(messages, companyName);
      setReportData(data);
      setIsGenerating(false);
    }, 1500);

    return () => clearTimeout(timer);
  }, [messages, companyName]);

  // 雷达图数据
  const radarData = reportData?.dimensions.map(d => ({
    subject: d.name,
    value: Math.round((d.score / d.maxScore) * 100),
    fullMark: 100,
  })) || [];

  // 计算评分等级
  const getScoreLevel = (score: number) => {
    if (score >= 90) return { text: "优秀", color: "text-green-500" };
    if (score >= 80) return { text: "良好", color: "text-blue-500" };
    if (score >= 70) return { text: "中等", color: "text-yellow-500" };
    return { text: "待提升", color: "text-orange-500" };
  };

  if (isGenerating) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-purple-50 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full mx-4 text-center"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="w-16 h-16 border-4 border-purple-200 border-t-purple-600 rounded-full mx-auto mb-6"
          />
          <h2 className="text-xl font-bold text-gray-900 mb-2">正在生成访谈报告</h2>
          <p className="text-gray-500">AI 正在分析访谈内容，请稍候...</p>
        </motion.div>
      </div>
    );
  }

  if (!reportData) return null;

  const scoreLevel = getScoreLevel(reportData.overallScore);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-purple-50 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        {/* 头部 */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-6"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">访谈报告</h1>
              <p className="text-sm text-gray-500">
                {companyName} {interviewerName && `· ${interviewerName}`}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg border hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700">
              <Share2 className="w-4 h-4" />
              <span className="hidden md:inline">分享</span>
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm font-medium">
              <Download className="w-4 h-4" />
              <span className="hidden md:inline">导出PDF</span>
            </button>
          </div>
        </motion.div>

        {/* 执行摘要 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl shadow-sm border p-6 mb-6"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-3">
                <div className="px-2 py-1 bg-purple-100 text-purple-700 rounded-md text-xs font-medium">
                  AI 洞察
                </div>
                <h2 className="text-lg font-bold text-gray-900">执行摘要</h2>
              </div>
              <p className="text-gray-600 leading-relaxed">
                {reportData.summary}
              </p>
            </div>
            <div className="ml-6 flex-shrink-0 text-center">
              <p className="text-sm text-gray-500 mb-1">综合得分</p>
              <div className="relative w-24 h-24">
                <svg className="w-24 h-24 -rotate-90">
                  <circle
                    cx="48"
                    cy="48"
                    r="40"
                    strokeWidth="8"
                    fill="none"
                    className="stroke-gray-100"
                  />
                  <circle
                    cx="48"
                    cy="48"
                    r="40"
                    strokeWidth="8"
                    fill="none"
                    className="stroke-green-500"
                    strokeLinecap="round"
                    strokeDasharray={`${(reportData.overallScore / 100) * 251.2} 251.2`}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-3xl font-bold text-gray-900">{reportData.overallScore}</span>
                </div>
              </div>
              <div className="flex items-center justify-center gap-1 mt-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full ${
                      i <= Math.floor(reportData.overallScore / 20)
                        ? "bg-green-500"
                        : "bg-gray-200"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        {/* 能力雷达 + 详细评估 */}
        <div className="grid md:grid-cols-5 gap-6 mb-6">
          {/* 能力雷达图 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="md:col-span-2 bg-white rounded-2xl shadow-sm border p-6"
          >
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-5 h-5 text-purple-600" />
              <h2 className="text-lg font-bold text-gray-900">能力雷达</h2>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#e5e7eb" />
                  <PolarAngleAxis
                    dataKey="subject"
                    tick={{ fontSize: 11, fill: "#6b7280" }}
                  />
                  <PolarRadiusAxis
                    angle={90}
                    domain={[0, 100]}
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                  />
                  <Radar
                    name="得分"
                    dataKey="value"
                    stroke="#8b5cf6"
                    fill="#8b5cf6"
                    fillOpacity={0.3}
                    strokeWidth={2}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            
            {/* 分数卡片 */}
            <div className="grid grid-cols-2 gap-3 mt-4">
              {reportData.dimensions.slice(0, 4).map((dim, idx) => (
                <div key={idx} className="bg-gray-50 rounded-lg p-3">
                  <div className="text-2xl font-bold text-green-600">{dim.score}</div>
                  <div className="text-xs text-gray-500">{dim.name}</div>
                  <div className="mt-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full"
                      style={{ width: `${(dim.score / dim.maxScore) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* 详细评估 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="md:col-span-3 bg-white rounded-2xl shadow-sm border p-6 max-h-[600px] overflow-y-auto"
          >
            <div className="flex items-center gap-2 mb-4">
              <Target className="w-5 h-5 text-purple-600" />
              <h2 className="text-lg font-bold text-gray-900">详细评估</h2>
            </div>
            
            <div className="space-y-6">
              {reportData.dimensions.map((dim, idx) => (
                <div key={idx} className="border-b border-gray-100 pb-6 last:border-0">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-900">{dim.name}</h3>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${(dim.score / dim.maxScore) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-gray-700">
                        {dim.score}/{dim.maxScore}
                      </span>
                    </div>
                  </div>
                  
                  <div className="grid md:grid-cols-2 gap-4">
                    {/* 亮点 */}
                    <div>
                      <div className="flex items-center gap-1 text-green-600 text-sm font-medium mb-2">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>亮点</span>
                      </div>
                      <ul className="space-y-1">
                        {dim.highlights.map((h, i) => (
                          <li key={i} className="text-sm text-gray-600 flex gap-2">
                            <span className="text-green-500">•</span>
                            {h}
                          </li>
                        ))}
                      </ul>
                    </div>
                    
                    {/* 待改进 */}
                    {dim.improvements.length > 0 && (
                      <div>
                        <div className="flex items-center gap-1 text-orange-500 text-sm font-medium mb-2">
                          <AlertCircle className="w-4 h-4" />
                          <span>待改进</span>
                        </div>
                        <ul className="space-y-1">
                          {dim.improvements.map((imp, i) => (
                            <li key={i} className="text-sm text-gray-600 flex gap-2">
                              <span className="text-orange-500">•</span>
                              {imp}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  
                  {/* 建议 */}
                  {dim.suggestion && (
                    <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                      <div className="flex gap-2">
                        <Lightbulb className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-blue-800">
                          <span className="font-medium">建议：</span>
                          {dim.suggestion}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* 关键洞察 + 后续步骤 */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* 关键洞察 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white rounded-2xl shadow-sm border p-6"
          >
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-5 h-5 text-purple-600" />
              <h2 className="text-lg font-bold text-gray-900">关键洞察</h2>
            </div>
            <ul className="space-y-3">
              {reportData.keyInsights.map((insight, idx) => (
                <li key={idx} className="flex gap-3">
                  <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-medium text-purple-600">{idx + 1}</span>
                  </div>
                  <span className="text-gray-700">{insight}</span>
                </li>
              ))}
            </ul>
          </motion.div>

          {/* 后续步骤 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-white rounded-2xl shadow-sm border p-6"
          >
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-green-600" />
              <h2 className="text-lg font-bold text-gray-900">建议后续步骤</h2>
            </div>
            <ul className="space-y-3">
              {reportData.nextSteps.map((step, idx) => (
                <li key={idx} className="flex gap-3">
                  <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                  </div>
                  <span className="text-gray-700">{step}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        </div>

        {/* 底部操作 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-8 text-center"
        >
          <p className="text-sm text-gray-500 mb-4">
            报告生成时间：{new Date().toLocaleString("zh-CN")}
          </p>
          {onClose && (
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
            >
              关闭报告
            </button>
          )}
        </motion.div>
      </div>
    </div>
  );
}


