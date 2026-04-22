import type { FormEvent, ReactNode } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  title: string;
  children: ReactNode;
  error: string | null;
  submitLabel: string;
  isSubmitting: boolean;
  onSubmit: (e: FormEvent) => void;
  footer: ReactNode;
};

export function AuthFormFields({
  title,
  children,
  error,
  submitLabel,
  isSubmitting,
  onSubmit,
  footer,
}: Props) {
  return (
    <Card className="border-white/10 bg-zinc-950/40 shadow-2xl">
      <CardHeader>
        <CardTitle className="text-xl text-gradient-hero">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          {children}
          {error && (
            <Alert variant="destructive" className="border-rose-500/30">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button
            type="submit"
            variant="glow"
            className="w-full"
            size="lg"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Please wait…" : submitLabel}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="text-sm text-muted-foreground">{footer}</CardFooter>
    </Card>
  );
}
