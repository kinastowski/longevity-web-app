"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { experts } from "@/lib/experts";

export default function Home() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Header */}
      <header className="px-8 pt-12 pb-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-50">
          GO Life
        </h1>
        <p className="mt-2 text-zinc-400 text-sm tracking-widest uppercase">
          Twój panel ekspertów AI
        </p>
      </header>

      {/* Expert grid */}
      <main className="flex-1 px-6 pb-12 flex items-start justify-center">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 w-full max-w-4xl">
          {experts.map((expert) => (
            <Card
              key={expert.id}
              onClick={() => router.push(`/chat/${expert.id}`)}
              className="bg-zinc-900 border border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800 cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:shadow-zinc-900/50 group"
            >
              <CardContent className="p-6 flex flex-col gap-3">
                <span className="text-4xl leading-none">{expert.emoji}</span>
                <div>
                  <h2 className="text-lg font-semibold text-zinc-100 group-hover:text-white transition-colors">
                    {expert.name}
                  </h2>
                  <p className="text-xs text-zinc-500 mt-0.5 uppercase tracking-wider">
                    {expert.subtitle}
                  </p>
                </div>
                <p className="text-sm text-zinc-400 leading-relaxed line-clamp-3">
                  {expert.welcome}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
