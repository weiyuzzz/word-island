"use client";

import { Download, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { exportProgressAction } from "@/server/actions";
import { Button, useToast } from "./ui";

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ExportProgressButton() {
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const onClick = () => {
    startTransition(async () => {
      const res = await exportProgressAction();
      if (!res.ok) return toast({ kind: "error", title: res.error });
      download(res.data.filename, res.data.content, res.data.mime);
      toast({ kind: "success", title: `已导出 ${res.data.filename}` });
    });
  };

  return (
    <Button size="sm" variant="secondary" disabled={pending} onClick={onClick} icon={pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}>
      导出备份
    </Button>
  );
}
