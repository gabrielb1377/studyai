import Link from "next/link";
import { CheckCircle2, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import type { TargetedReviewRecommendation } from "../DifficultyMapEngine";
import { REVIEW_STATUS_LABELS } from "./learning-constants";

export function TargetedReviewsTab({
  filteredRecommendations,
  isSaving,
  onCompleteTargetedReview,
}: {
  filteredRecommendations: TargetedReviewRecommendation[];
  isSaving: boolean;
  onCompleteTargetedReview: (
    recommendation: TargetedReviewRecommendation,
    result: "correct" | "wrong"
  ) => Promise<void>;
}) {
  return (
    <section aria-label="Revisões direcionadas" className="space-y-4">
      {filteredRecommendations.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Nenhuma revisão urgente pendente"
          description="Quando houver erros pendentes, flashcards vencidos ou revisões atrasadas, eles serão priorizados aqui com ação direta."
        />
      ) : (
        <div className="space-y-3">
          {filteredRecommendations.map((rec) => (
            <Card key={rec.id} className="gap-3 p-4 shadow-none">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <h2 className="text-base font-semibold">{rec.studyTitle}</h2>
                  <p className="text-xs text-muted-foreground">
                    {rec.subject} · {REVIEW_STATUS_LABELS[rec.reviewStatus]}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={
                    rec.urgencyLabel === "Alta"
                      ? "border-destructive/30 bg-destructive/10 text-destructive"
                      : rec.urgencyLabel === "Média"
                        ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                        : "border-border bg-muted/60 text-muted-foreground"
                  }
                >
                  Urgência {rec.urgencyLabel}
                </Badge>
              </div>

              <ul className="space-y-1 text-xs text-muted-foreground">
                {rec.reasons.map((reason) => (
                  <li key={reason}>• {reason}</li>
                ))}
              </ul>

              {rec.sampleErrors.length > 0 ? (
                <div className="rounded-lg border bg-muted/30 p-3 text-xs">
                  <p className="font-semibold text-foreground">Erros recentes para focar:</p>
                  <ul className="mt-1 space-y-1 text-muted-foreground">
                    {rec.sampleErrors.map((sample) => (
                      <li key={sample.id} className="truncate">
                        — {sample.questionPrompt}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <Button asChild size="sm">
                  <Link href={rec.targetHref}>
                    Revisar no Estudo
                    <ExternalLink className="size-3.5" />
                  </Link>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isSaving}
                  onClick={() => void onCompleteTargetedReview(rec, "correct")}
                >
                  Acertei na revisão
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isSaving}
                  onClick={() => void onCompleteTargetedReview(rec, "wrong")}
                >
                  Ainda com dificuldade
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
