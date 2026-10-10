import { NextResponse } from "next/server";
import { dataEnvelope } from "@/lib/api-errors";
import { listHelpArticles, searchHelpArticles } from "@/server/help";

/** GET /api/v1/help?category=&q= — public (docs/04 §4.19, docs/08). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const category = url.searchParams.get("category");
  const q = url.searchParams.get("q");
  const articles = q ? searchHelpArticles(q) : listHelpArticles(category);
  return NextResponse.json(
    dataEnvelope(
      articles.map((a) => ({
        slug: a.slug,
        title: a.title,
        category: a.category,
        summary: a.summary,
      }))
    )
  );
}
