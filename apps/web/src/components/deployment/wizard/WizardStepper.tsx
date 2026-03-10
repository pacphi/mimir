import { cn } from "@/lib/utils";

export interface WizardStep {
  id: number;
  label: string;
  description: string;
}

interface WizardStepperProps {
  steps: WizardStep[];
  currentStep: number;
  onStepClick?: (stepId: number) => void;
}

export function WizardStepper({ steps, currentStep, onStepClick }: WizardStepperProps) {
  return (
    <nav aria-label="Deployment wizard steps">
      <ol className="flex w-full">
        {steps.map((step, index) => {
          const isCompleted = currentStep > step.id;
          const isCurrent = currentStep === step.id;
          const isLast = index === steps.length - 1;

          const canClick = isCompleted && !!onStepClick;

          const circleClasses = cn(
            "flex items-center justify-center w-8 h-8 rounded-full border-2 text-sm font-medium transition-colors shrink-0",
            isCompleted && "bg-primary border-primary text-primary-foreground",
            isCurrent && "border-primary text-primary bg-background",
            !isCompleted &&
              !isCurrent &&
              "border-muted-foreground text-muted-foreground bg-background",
            canClick &&
              "cursor-pointer hover:ring-2 hover:ring-primary/50 hover:ring-offset-1 hover:ring-offset-background",
          );

          const circleContent = isCompleted ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          ) : (
            step.id
          );

          return (
            <li key={step.id} className={cn("flex", !isLast && "flex-1")}>
              {/* Circle + label column */}
              <div className="flex flex-col items-center w-full">
                {/* Row with circle and connector */}
                <div className="flex items-center w-full">
                  {/* Spacer before circle to center it */}
                  <div className="flex-1" />
                  {canClick ? (
                    <button
                      type="button"
                      className={circleClasses}
                      onClick={() => onStepClick(step.id)}
                      aria-label={`Go back to step ${step.id}: ${step.label}`}
                    >
                      {circleContent}
                    </button>
                  ) : (
                    <div className={circleClasses} aria-current={isCurrent ? "step" : undefined}>
                      {circleContent}
                    </div>
                  )}
                  {/* Connector line or spacer */}
                  {!isLast ? (
                    <div
                      className={cn(
                        "flex-1 h-0.5 mx-1.5 transition-colors",
                        isCompleted ? "bg-primary" : "bg-border",
                      )}
                    />
                  ) : (
                    <div className="flex-1" />
                  )}
                </div>
                {/* Label below circle */}
                <span
                  className={cn(
                    "text-[10px] font-medium mt-1 text-center leading-tight max-w-[72px]",
                    canClick && "cursor-pointer",
                    isCurrent ? "text-primary" : "text-muted-foreground",
                  )}
                  onClick={canClick ? () => onStepClick(step.id) : undefined}
                  role={canClick ? "button" : undefined}
                  tabIndex={canClick ? 0 : undefined}
                  onKeyDown={
                    canClick
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") onStepClick(step.id);
                        }
                      : undefined
                  }
                >
                  {step.label}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
