"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, AlertCircle, Building2 } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://xvtgrzavwqesdfcifyrq.supabase.co/functions/v1";

export default function LinkRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "valid" | "invalid">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [linkInfo, setLinkInfo] = useState<{
    company_name: string;
    interviewer_name: string | null;
  } | null>(null);

  useEffect(() => {
    const verifyLink = async () => {
      try {
        const code = params.code as string;
        
        const response = await fetch(`${API_URL}/verify-link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ link_code: code }),
        });

        const data = await response.json();

        if (data.valid) {
          setLinkInfo({
            company_name: data.company_name,
            interviewer_name: data.interviewer_name,
          });
          setStatus("valid");

          // 存储链接信息到 sessionStorage
          sessionStorage.setItem("interview_link", JSON.stringify({
            code,
            company_name: data.company_name,
            interviewer_name: data.interviewer_name,
            link_id: data.link_id,
            voice: data.voice || 'xinwen',
            purpose: data.purpose,
          }));

          // 延迟跳转到访谈页面
          setTimeout(() => {
            router.push(`/interview/${code}`);
          }, 1500);
        } else {
          setStatus("invalid");
          setErrorMessage(data.reason || "链接无效");
        }
      } catch (error) {
        console.error("验证链接失败:", error);
        setStatus("invalid");
        setErrorMessage("验证链接失败，请稍后重试");
      }
    };

    verifyLink();
  }, [params.code, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-white to-blue-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full mx-4 text-center"
      >
        {status === "loading" && (
          <>
            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
            </div>
            <h1 className="text-xl font-bold mb-2">正在验证链接</h1>
            <p className="text-gray-500">请稍候...</p>
          </>
        )}

        {status === "valid" && linkInfo && (
          <>
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Building2 className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-xl font-bold mb-2">链接验证成功</h1>
            <p className="text-gray-500 mb-4">
              即将开始 <span className="font-semibold text-purple-600">{linkInfo.company_name}</span> 的访谈
              {linkInfo.interviewer_name && (
                <span>（{linkInfo.interviewer_name}）</span>
              )}
            </p>
            <div className="flex items-center justify-center gap-2 text-purple-600">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>正在跳转...</span>
            </div>
          </>
        )}

        {status === "invalid" && (
          <>
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-xl font-bold mb-2">链接无效</h1>
            <p className="text-gray-500 mb-6">{errorMessage}</p>
            <button
              onClick={() => router.push("/")}
              className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              返回首页
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
}

