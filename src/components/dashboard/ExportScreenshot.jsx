import React, { useRef } from "react";
import { Camera } from "lucide-react";
import html2canvas from "html2canvas";
import { format } from "date-fns";

export default function ExportScreenshot({ day, containerRef, onExport }) {
  const isExporting = useRef(false);

  const handleExportScreenshot = async () => {
    if (isExporting.current || !containerRef.current) return;
    isExporting.current = true;

    try {
      const timelineEl = containerRef.current.querySelector(".overflow-x-hidden");
      if (!timelineEl) return;

      // Clone the element and adjust sizing for better readability
      const clone = timelineEl.cloneNode(true);
      clone.style.position = "fixed";
      clone.style.left = "-9999px";
      clone.style.top = "-9999px";
      clone.style.width = timelineEl.offsetWidth + "px";
      
      // Remove all truncation and overflow issues
      const allTruncated = clone.querySelectorAll(".truncate");
      allTruncated.forEach(el => {
        el.classList.remove("truncate");
        el.style.whiteSpace = "normal";
        el.style.wordWrap = "break-word";
        el.style.overflow = "visible";
        el.style.textOverflow = "clip";
      });

      // Increase row heights for better visibility in export
      const rows = clone.querySelectorAll("[id^='dayview-row-']");
      rows.forEach(row => {
        row.style.height = "80px";
        row.style.overflow = "visible";
        
        // Expand sidebar width to fit text
        const sidebar = row.querySelector("div[style*='160']");
        if (sidebar) {
          sidebar.style.minWidth = "auto";
          sidebar.style.overflow = "visible";
          sidebar.querySelectorAll("div").forEach(div => {
            div.style.overflow = "visible";
          });
        }
        
        // Fix shift bar text display
        const shiftBars = row.querySelectorAll("div[style*='backgroundColor']");
        shiftBars.forEach(bar => {
          bar.style.overflow = "visible";
          bar.querySelectorAll("span").forEach(span => {
            span.style.whiteSpace = "normal";
            span.style.overflow = "visible";
            span.style.display = "block";
          });
        });
      });
      
      document.body.appendChild(clone);

      const canvas = await html2canvas(clone, {
        backgroundColor: "#ffffff",
        scale: 4,
        logging: false,
        useCORS: true,
        allowTaint: true,
      });

      document.body.removeChild(clone);

      // Download the image
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = `schedule-${format(day, "yyyy-MM-dd")}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      onExport && onExport();
    } catch (error) {
      console.error("Screenshot export failed:", error);
    } finally {
      isExporting.current = false;
    }
  };

  return (
    <button
      onClick={handleExportScreenshot}
      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-700 transition-colors text-left"
    >
      <Camera className="w-4 h-4 text-gray-400" />
      Export screenshot of shifts
    </button>
  );
}