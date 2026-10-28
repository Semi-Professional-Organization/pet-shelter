"use client";

import React from "react";
import { Download, FileText } from "lucide-react";
import {
  FinancialReportRecord,
  formatReportPeriod,
  formatTimestampDate,
} from "@/lib/domain/transparency";
import { useLanguage } from "@/components/providers/LanguageProvider";

/** Absolute http(s) links leave the site; relative paths are our own files. */
function isExternal(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function FinancialReportsTable({
  reports,
}: {
  reports: FinancialReportRecord[];
}) {
  const { isMs } = useLanguage();

  if (reports.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-background p-8 text-center">
        <p className="text-sm text-muted-foreground">
          {isMs
            ? "Penyata kewangan yang telah diaudit akan disenaraikan di sini selepas difailkan."
            : "Audited financial statements will be listed here once filed."}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <caption className="sr-only">
          {isMs
            ? "Laporan kewangan dan audit tahunan yang boleh dimuat turun"
            : "Downloadable annual audit and spending reports"}
        </caption>
        <thead>
          <tr className="bg-muted/40 text-left">
            <th scope="col" className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {isMs ? "Tempoh" : "Period"}
            </th>
            <th scope="col" className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {isMs ? "Dokumen" : "Document"}
            </th>
            <th scope="col" className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {isMs ? "Diterbitkan" : "Published"}
            </th>
            <th scope="col" className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {isMs ? "Muat turun" : "Download"}
            </th>
          </tr>
        </thead>
        <tbody>
          {reports.map((report) => (
            <tr key={report.id} className="border-t border-border align-top">
              <th
                scope="row"
                className="whitespace-nowrap px-4 py-4 text-left font-semibold text-foreground"
              >
                {formatReportPeriod(report.year, report.month, isMs)}
              </th>
              <td className="px-4 py-4">
                <div className="flex items-start gap-2.5">
                  <FileText className="mt-0.5 size-4 shrink-0 text-primary-ink" aria-hidden="true" />
                  <div className="space-y-1">
                    <p className="font-semibold leading-snug text-foreground">
                      {report.title}
                    </p>
                    {report.summary && (
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {report.summary}
                      </p>
                    )}
                  </div>
                </div>
              </td>
              <td className="whitespace-nowrap px-4 py-4 text-xs text-muted-foreground">
                {formatTimestampDate(report.publishedAt, isMs)}
              </td>
              <td className="px-4 py-4 text-right">
                <a
                  href={report.fileUrl}
                  {...(isExternal(report.fileUrl)
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : { download: true })}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted"
                >
                  <Download className="size-3.5" aria-hidden="true" />
                  PDF
                  <span className="sr-only">
                    {" — "}
                    {report.title}
                  </span>
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
