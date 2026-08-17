import { NextRequest, NextResponse } from "next/server";
import { analyserQuestion } from "@/lib/gemini";
import { construireRequete, ErreurValidation } from "@/lib/validateur";
import { dbReadOnly } from "@/lib/db";

const ROLE_ACTUEL = "MANAGER";

export async function POST(req: NextRequest) {
    const { question } = await req.json();

    try {
        const spec = await analyserQuestion(question, ROLE_ACTUEL);

        if (!spec.ok) {
            return NextResponse.json({ refus: spec.raison });
        }

        const { sql, params } = construireRequete(spec, ROLE_ACTUEL);
        console.log("SQL exécuté :", sql, params);

        const res = await dbReadOnly.query(sql, params);
        return NextResponse.json({ lignes: res.rows, sql });

    } catch (e) {
        if (e instanceof ErreurValidation) {
            return NextResponse.json({ refus: e.message });
        }
        console.error(e);
        return NextResponse.json({ erreur: "Traitement impossible." }, { status: 500 });
    }
}