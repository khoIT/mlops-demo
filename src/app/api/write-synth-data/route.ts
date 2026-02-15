import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { players, events, payments, uaCosts, labels } = body as Record<string, string>;

    const publicDir = path.join(process.cwd(), "public");

    await Promise.all([
      writeFile(path.join(publicDir, "game-players.csv"), players, "utf-8"),
      writeFile(path.join(publicDir, "game-events.csv"), events, "utf-8"),
      writeFile(path.join(publicDir, "game-payments.csv"), payments, "utf-8"),
      writeFile(path.join(publicDir, "game-ua-costs.csv"), uaCosts, "utf-8"),
      writeFile(path.join(publicDir, "game-labels.csv"), labels, "utf-8"),
    ]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
