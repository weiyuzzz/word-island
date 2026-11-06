import Link from "next/link";
import { House, TreePalm } from "lucide-react";
import { Button, Card } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg py-12">
      <Card className="p-8 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-ocean-50 text-ocean-600">
          <TreePalm className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-xl font-bold">这座岛还没被发现</h2>
        <p className="mt-2 text-sm text-slate-500">
          你访问的页面不存在，可能链接已过期或地址输错了。
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex h-11 items-center gap-2 rounded-2xl bg-ocean-500 px-4 text-sm font-medium text-white hover:bg-ocean-600"
          >
            <House className="h-4 w-4" /> 返回首页
          </Link>
        </div>
      </Card>
    </div>
  );
}
