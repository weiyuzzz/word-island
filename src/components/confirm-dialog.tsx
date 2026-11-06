"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button, Modal } from "./ui";

export interface ConfirmState {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
  onConfirm: () => void;
}

export function ConfirmDialog({ state, onClose }: { state: ConfirmState; onClose: () => void }) {
  return (
    <Modal
      open={state.open}
      onClose={onClose}
      title={state.title}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {state.cancelLabel ?? "取消"}
          </Button>
          <Button
            variant={state.variant === "danger" ? "danger" : "primary"}
            onClick={() => {
              state.onConfirm();
              onClose();
            }}
          >
            {state.confirmLabel ?? "确定"}
          </Button>
        </div>
      }
    >
      {state.description && (
        <div className="flex items-start gap-3 py-1">
          {state.variant === "danger" && (
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-coral-100 text-coral-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
          )}
          <p className="text-sm leading-relaxed text-slate-600">{state.description}</p>
        </div>
      )}
    </Modal>
  );
}

export function useConfirm() {
  const [state, setState] = useState<ConfirmState>({
    open: false,
    title: "",
    onConfirm: () => {},
  });

  const confirm = (options: Omit<ConfirmState, "open">) => {
    setState({ ...options, open: true });
  };

  const close = () => setState((s) => ({ ...s, open: false }));

  return { state, confirm, close };
}
