import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { WizardMode } from "@/stores/deploymentWizardStore";

interface ModeSelectorProps {
  onSelect: (mode: WizardMode) => void;
}

export function ModeSelector({ onSelect }: ModeSelectorProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">New Deployment</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Choose how you'd like to configure your deployment
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Guided Mode Card */}
        <Card
          className={cn(
            "cursor-pointer transition-all hover:border-primary hover:shadow-md",
            "border-2 border-transparent",
          )}
          onClick={() => onSelect("guided")}
        >
          <CardHeader className="pb-2">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
              <svg
                className="w-5 h-5 text-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                />
              </svg>
            </div>
            <CardTitle className="text-base">Guided</CardTitle>
            <CardDescription>
              Step-by-step form that assembles your configuration automatically
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="text-xs text-muted-foreground space-y-1">
              <li className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-primary shrink-0" />
                7-step wizard with validation
              </li>
              <li className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-primary shrink-0" />
                No YAML editing required
              </li>
              <li className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-primary shrink-0" />
                Provider-specific options
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* Expert Mode Card */}
        <Card
          className={cn(
            "cursor-pointer transition-all hover:border-primary hover:shadow-md",
            "border-2 border-transparent",
          )}
          onClick={() => onSelect("expert")}
        >
          <CardHeader className="pb-2">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
              <svg
                className="w-5 h-5 text-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                />
              </svg>
            </div>
            <CardTitle className="text-base">Expert</CardTitle>
            <CardDescription>
              Full YAML editor — type, paste, or import your configuration
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="text-xs text-muted-foreground space-y-1">
              <li className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-primary shrink-0" />
                Full control over YAML
              </li>
              <li className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-primary shrink-0" />
                Import from file or template
              </li>
              <li className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-primary shrink-0" />
                Syntax validation & preview
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
