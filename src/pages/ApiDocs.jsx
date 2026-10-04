import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Markdown from "react-markdown";
import { Flame, Copy, Check, FileJson, FileText, ArrowLeft } from "lucide-react";
import { buildApiDocs } from "@/lib/apiDocs";

// Public page (no sign in needed) at /api-docs. The same Markdown is served raw at /api/v1/docs for
// AI assistants; this page just renders it for people.

function CopyLink({ text, label, icon: Icon }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          window.prompt("Copy this:", text);
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Icon className="w-3.5 h-3.5" />}
      {copied ? "Copied" : label}
    </button>
  );
}

const components = {
  h1: (p) => <h1 className="text-3xl font-bold text-gray-900 mt-2 mb-4" {...p} />,
  h2: (p) => <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3 pb-2 border-b border-gray-100" {...p} />,
  h3: (p) => <h3 className="text-lg font-semibold text-gray-900 mt-8 mb-2" {...p} />,
  p: (p) => <p className="text-gray-700 leading-relaxed my-3" {...p} />,
  ul: (p) => <ul className="list-disc pl-6 my-3 space-y-1.5 text-gray-700" {...p} />,
  ol: (p) => <ol className="list-decimal pl-6 my-3 space-y-1.5 text-gray-700" {...p} />,
  li: (p) => <li className="leading-relaxed" {...p} />,
  a: (p) => <a className="text-orange-600 underline" {...p} />,
  strong: (p) => <strong className="font-semibold text-gray-900" {...p} />,
  pre: (p) => <pre className="my-4 overflow-x-auto rounded-lg bg-gray-900 text-gray-100 p-4 text-[13px] leading-relaxed" {...p} />,
  code: ({ className, children, ...rest }) => {
    const block = /\n/.test(String(children)) || (className || "").startsWith("language-");
    return block
      ? <code className={className} {...rest}>{children}</code>
      : <code className="rounded bg-orange-50 text-orange-800 px-1.5 py-0.5 text-[0.85em] [overflow-wrap:anywhere]" {...rest}>{children}</code>;
  },
};

export default function ApiDocs() {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://shift-schedule-website.vercel.app";
  const markdown = useMemo(() => buildApiDocs(origin), [origin]);

  return (
    <div className="min-h-screen bg-gray-50/50">
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-sm">
              <Flame className="w-5 h-5 text-white" />
            </div>
            <span className="font-semibold text-gray-900 text-lg tracking-tight hidden sm:block">Restaurant Scheduler</span>
            <span className="text-sm text-gray-400 hidden sm:block">/ API</span>
          </Link>
          <Link to="/Settings" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900">
            <ArrowLeft className="w-4 h-4" /> Back to the app
          </Link>
        </div>
      </nav>
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6 flex flex-wrap gap-2">
          <CopyLink text={`${origin}/api/v1/docs`} label="Copy docs link for Muse" icon={FileText} />
          <CopyLink text={`${origin}/api/v1/openapi.json`} label="Copy OpenAPI link" icon={FileJson} />
          <CopyLink text={`${origin}/api/v1`} label="Copy base URL" icon={Copy} />
        </div>
        <article className="rounded-2xl border border-gray-100 bg-white p-6 sm:p-10 shadow-sm">
          <Markdown components={components}>{markdown}</Markdown>
        </article>
      </main>
    </div>
  );
}
