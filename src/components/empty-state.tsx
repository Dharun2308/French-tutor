import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function EmptyState({
  title,
  description,
  actionLabel,
  actionHref,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
        <div className="text-4xl">✨</div>
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {actionLabel && actionHref && (
          <Button asChild>
            <Link href={actionHref}>{actionLabel}</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
