"use client";

import { useState, useRef } from "react";
import { Upload, FileText, AlertCircle, Check, Copy, Download, RefreshCw, HelpCircle } from "lucide-react";
import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://xvtgrzavwqesdfcifyrq.supabase.co/functions/v1";
const ADMIN_PASSWORD = "tantan2024";

interface CSVRow {
  theme: string;
  company_name?: string;
  interviewer_name?: string;
  purpose?: string;
}

interface GeneratedLink {
  theme: string;
  company_name: string | null;
  interviewer_name: string | null;
  purpose: string | null;
  link_url: string;
}

export default function BatchCSVUploader() {
  const [csvData, setCsvData] = useState<CSVRow[]>([]);
  const [csvFileName, setCsvFileName] = useState<string>("");
  const [uploadError, setUploadError] = useState<string>("");
  const [uploadSuccess, setUploadSuccess] = useState<string>("");
  const [expiresHours, setExpiresHours] = useState(168); // 7天
  const [syncToFeishu, setSyncToFeishu] = useState(true);
  const [generatedLinks, setGeneratedLinks] = useState<GeneratedLink[]>([]);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 下载CSV模板
  const downloadTemplate = () => {
    const template = `调研主题,公司名称,访谈者,访谈目的
小米公司调研,小米,王总,Q4产品需求调研
白皮书调研,,,2024行业白皮书
经销商调研,某地经销商,李经理,渠道合作意向`;

    const blob = new Blob(["\uFEFF" + template], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "访谈链接批量创建模板.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // 解析CSV
  const parseCSV = (text: string): CSVRow[] => {
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 2) {
      throw new Error("CSV 文件至少需要包含标题行和一行数据");
    }

    // 解析标题行
    const headers = lines[0].split(",").map(h => h.trim().replace(/^["']|["']$/g, ""));
    
    // 查找列索引（支持中英文）
    const themeIndex = headers.findIndex(h => 
      h.includes("主题") || h.includes("调研") || h.toLowerCase().includes("theme")
    );
    const companyIndex = headers.findIndex(h => 
      h.includes("公司") || h.toLowerCase().includes("company")
    );
    const interviewerIndex = headers.findIndex(h => 
      h.includes("访谈者") || h.includes("姓名") || h.toLowerCase().includes("interviewer") || h.toLowerCase().includes("name")
    );
    const purposeIndex = headers.findIndex(h => 
      h.includes("目的") || h.toLowerCase().includes("purpose")
    );

    if (themeIndex === -1) {
      throw new Error('CSV 文件必须包含"调研主题"或"theme"列');
    }

    // 解析数据行
    const rows: CSVRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      const theme = values[themeIndex]?.trim();
      
      if (theme) {
        rows.push({
          theme,
          company_name: companyIndex >= 0 ? values[companyIndex]?.trim() : undefined,
          interviewer_name: interviewerIndex >= 0 ? values[interviewerIndex]?.trim() : undefined,
          purpose: purposeIndex >= 0 ? values[purposeIndex]?.trim() : undefined,
        });
      }
    }

    return rows;
  };

  // 解析CSV行（处理引号内的逗号）
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        result.push(current.replace(/^["']|["']$/g, ""));
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.replace(/^["']|["']$/g, ""));
    return result;
  };

  // 处理文件上传
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadError("");
    setUploadSuccess("");
    setCsvFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const rows = parseCSV(text);
        setCsvData(rows);
        setUploadSuccess(`✅ 成功解析 ${rows.length} 条记录`);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "解析文件失败");
        setCsvData([]);
      }
    };
    reader.onerror = () => {
      setUploadError("读取文件失败");
    };
    reader.readAsText(file, "utf-8");
  };

  // 处理拖拽上传
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.csv') || file.name.endsWith('.txt'))) {
      const fakeEvent = {
        target: { files: [file] }
      } as React.ChangeEvent<HTMLInputElement>;
      handleFileUpload(fakeEvent);
    } else {
      setUploadError("请上传 CSV 或 TXT 文件");
    }
  };

  // 生成链接
  const generateLinksFromCSV = async () => {
    if (csvData.length === 0) {
      setUploadError("没有可用的数据");
      return;
    }

    setLoading(true);
    setUploadError("");
    setUploadSuccess("");

    try {
      const savedPassword = localStorage.getItem("admin_password") || ADMIN_PASSWORD;
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://tantan.vercel.app";
      
      const items = csvData.map(row => ({
        theme: row.theme,
        company_name: row.company_name || null,
        interviewer_name: row.interviewer_name || null,
        purpose: row.purpose || null,
      }));

      const response = await axios.post(`${API_URL}/batch-links`, {
        items,
        expires_hours: expiresHours,
        max_uses: 0,
        write_to_feishu: syncToFeishu,
        base_url: baseUrl,
      }, {
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": savedPassword,
        },
      });

      if (response.data.success) {
        setGeneratedLinks(response.data.links || []);
        setUploadSuccess(`✅ 成功生成 ${response.data.count} 个链接${response.data.feishu_write ? "，已同步到飞书" : ""}`);
      } else {
        setUploadError(response.data.error || "生成链接失败");
      }
    } catch (err) {
      console.error("生成链接失败:", err);
      setUploadError(axios.isAxiosError(err) ? err.response?.data?.error || "网络请求失败" : "未知错误");
    } finally {
      setLoading(false);
    }
  };

  // 复制所有链接
  const copyAllLinks = () => {
    const text = generatedLinks.map(link => 
      `主题：${link.theme}\t公司：${link.company_name || "-"}\t访谈者：${link.interviewer_name || "-"}\t链接：${link.link_url}`
    ).join("\n");
    navigator.clipboard.writeText(text);
    alert("已复制到剪贴板");
  };

  // 下载链接
  const downloadLinks = () => {
    const headers = ["调研主题", "公司名称", "访谈者", "访谈目的", "访谈链接"];
    const rows = generatedLinks.map(link => [
      link.theme,
      link.company_name || "",
      link.interviewer_name || "",
      link.purpose || "",
      link.link_url,
    ]);

    const csv = [headers, ...rows].map(row => 
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")
    ).join("\n");
    
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `生成的访谈链接_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      {/* 上传区域 */}
      <div className="bg-white rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Upload className="w-5 h-5" />
            上传 CSV 文件
          </h2>
          <button
            onClick={downloadTemplate}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            下载模板
          </button>
        </div>
        
        <div className="mb-4 p-4 bg-blue-50 rounded-lg text-sm">
          <div className="flex items-start gap-2">
            <HelpCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-blue-900 mb-2">CSV 文件格式要求：</p>
              <ul className="list-disc list-inside space-y-1 text-blue-800">
                <li><strong>必须包含</strong>："调研主题"列（或 theme）</li>
                <li><strong>可选包含</strong>："公司名称"（company_name）、"访谈者"（interviewer_name）、"访谈目的"（purpose）</li>
              </ul>
              <div className="mt-3 p-2 bg-white rounded border border-blue-200">
                <p className="text-xs text-gray-600 mb-1">示例格式：</p>
                <code className="text-xs">调研主题,公司名称,访谈者,访谈目的</code>
              </div>
            </div>
          </div>
        </div>

        <div 
          className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-purple-400 hover:bg-purple-50/30 transition-all cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            onChange={handleFileUpload}
            className="hidden"
          />
          <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          {csvFileName ? (
            <>
              <p className="text-gray-700 font-medium mb-1">{csvFileName}</p>
              <p className="text-sm text-gray-500">点击重新选择文件</p>
            </>
          ) : (
            <>
              <p className="text-gray-700 font-medium mb-1">点击选择或拖拽 CSV 文件到此处</p>
              <p className="text-sm text-gray-500">支持 CSV、TXT 格式</p>
            </>
          )}
        </div>

        {uploadError && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{uploadError}</span>
          </div>
        )}

        {uploadSuccess && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg flex items-center gap-2">
            <Check className="w-5 h-5 flex-shrink-0" />
            <span>{uploadSuccess}</span>
          </div>
        )}
      </div>

      {/* 预览数据 */}
      {csvData.length > 0 && (
        <div className="bg-white rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">
            📋 预览数据 <span className="text-purple-600">({csvData.length} 条)</span>
          </h2>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b-2 border-gray-200">
                  <th className="text-left p-3 font-medium">#</th>
                  <th className="text-left p-3 font-medium">调研主题</th>
                  <th className="text-left p-3 font-medium">公司名称</th>
                  <th className="text-left p-3 font-medium">访谈者</th>
                  <th className="text-left p-3 font-medium">访谈目的</th>
                </tr>
              </thead>
              <tbody>
                {csvData.slice(0, 10).map((row, index) => (
                  <tr key={index} className="border-b hover:bg-gray-50">
                    <td className="p-3 text-gray-500">{index + 1}</td>
                    <td className="p-3 font-medium text-purple-600">{row.theme}</td>
                    <td className="p-3">{row.company_name || <span className="text-gray-400">-</span>}</td>
                    <td className="p-3">{row.interviewer_name || <span className="text-gray-400">-</span>}</td>
                    <td className="p-3">{row.purpose || <span className="text-gray-400">-</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {csvData.length > 10 && (
              <p className="text-center text-gray-500 mt-3 text-sm">... 还有 {csvData.length - 10} 条数据未显示</p>
            )}
          </div>

          {/* 生成选项 */}
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="text-sm font-medium text-gray-700 mb-3">⚙️ 批量设置</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  有效期
                </label>
                <select
                  value={expiresHours}
                  onChange={(e) => setExpiresHours(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value={0}>永久有效</option>
                  <option value={24}>1天</option>
                  <option value={72}>3天</option>
                  <option value={168}>7天</option>
                  <option value={720}>30天</option>
                </select>
              </div>
              
              <div className="flex items-end md:col-span-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={syncToFeishu}
                    onChange={(e) => setSyncToFeishu(e.target.checked)}
                    className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                  />
                  <span className="text-sm font-medium text-gray-700">同步到飞书多维表格</span>
                </label>
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={generateLinksFromCSV}
              disabled={loading}
              className="flex items-center gap-2 px-8 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-50 transition-colors text-lg font-medium"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5" />
                  生成 {csvData.length} 个链接
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* 生成结果 */}
      {generatedLinks.length > 0 && (
        <div className="bg-white rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-green-700">
              ✅ 已生成 {generatedLinks.length} 个链接
            </h2>
            <div className="flex gap-2">
              <button
                onClick={copyAllLinks}
                className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Copy className="w-4 h-4" />
                复制全部
              </button>
              <button
                onClick={downloadLinks}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Download className="w-4 h-4" />
                下载 CSV
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left p-3 font-medium">#</th>
                  <th className="text-left p-3 font-medium">调研主题</th>
                  <th className="text-left p-3 font-medium">公司名称</th>
                  <th className="text-left p-3 font-medium">访谈者</th>
                  <th className="text-left p-3 font-medium">访谈目的</th>
                  <th className="text-left p-3 font-medium">链接</th>
                  <th className="text-left p-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {generatedLinks.map((link, index) => (
                  <tr key={index} className="border-b hover:bg-gray-50">
                    <td className="p-3 text-gray-500">{index + 1}</td>
                    <td className="p-3 font-medium text-purple-600">{link.theme}</td>
                    <td className="p-3">{link.company_name || "-"}</td>
                    <td className="p-3">{link.interviewer_name || "-"}</td>
                    <td className="p-3">{link.purpose || "-"}</td>
                    <td className="p-3 font-mono text-xs text-purple-600 max-w-xs truncate">
                      {link.link_url}
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(link.link_url);
                          alert("已复制");
                        }}
                        className="p-1.5 text-gray-500 hover:bg-gray-100 rounded transition-colors"
                        title="复制链接"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

