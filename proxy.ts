import { NextRequest, NextResponse } from "next/server";

const COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];

export function proxy(req: NextRequest) {
    const connecte = COOKIES.some((c) => req.cookies.has(c));
    const { pathname } = req.nextUrl;

    if (!connecte && (pathname.startsWith("/chat") || pathname === "/")) {
        return NextResponse.redirect(new URL("/login", req.url));
    }
    if (connecte && pathname === "/login") {
        return NextResponse.redirect(new URL("/chat", req.url));
    }
    return NextResponse.next();
}

export const config = {
    matcher: ["/", "/chat/:path*", "/login"],
};