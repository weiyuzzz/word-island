import { NextResponse, type NextRequest } from "next/server";

// 未登录访问任何页面都跳到 /login；登录后由各页面自行渲染。
// 仅检查 cookie 是否存在，会话有效性在服务端（session.ts）再校验。
const PUBLIC_PREFIXES = ["/login", "/api/health", "/api/tts"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }
  const token = req.cookies.get("wi_session")?.value;
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|icon-maskable.svg|manifest.webmanifest|sw.js).*)"],
};
