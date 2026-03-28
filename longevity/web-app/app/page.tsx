"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { experts } from "@/lib/experts";

export default function Home() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center">
      {/* Header */}
      <header className="w-full text-center pt-16 pb-10 px-6">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-50">
          GO Life
        </h1>
        <p className="mt-2 text-zinc-400 text-sm tracking-widest uppercase">
          Your Personal Longevity Panel
        </p>
      </header>

      {/* Expert grid */}
      <main className="flex-1 w-full px-6 pb-16 flex justify-center">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-5xl">
          {experts.map((expert) => (
            <Card
              key={expert.id}
              onClick={() => router.push(`/chat/${expert.id}`)}
              className={cn(
                "bg-zinc-900 hover:bg-zinc-800/80 cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:shadow-xl",
                expert.accent.cardBorder
              )}
            >
              <CardContent className="p-7 flex flex-col gap-4">
                {/* Emoji */}
                <span className="text-5xl leading-none">{expert.emoji}</span>

                {/* Name + subtitle */}
                <div>
                  <h2 className="text-xl font-bold text-zinc-50 group-hover/card:text-white transition-colors">
                    {expert.name}
                  </h2>
                  <p
                    className={cn(
                      "text-xs uppercase tracking-widest mt-0.5",
                      expert.accent.subtitleText
                    )}
                  >
                    {expert.subtitle}
                  </p>
                </div>

                {/* Description */}
                <p className="text-sm text-zinc-400 leading-relaxed">
                  {expert.description}
                </p>

                {/* CTA button */}
                <Button
                  variant="ghost"
                  size="default"
                  className={cn("w-full mt-1", expert.accent.buttonClass)}
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/chat/${expert.id}`);
                  }}
                >
                  Talk to {expert.name}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
