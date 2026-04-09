import { Check } from "lucide-react";

interface CheckoutProgressProps {
  currentStep: number;
  totalSteps: number;
  labels: string[];
}

const CheckoutProgress = ({ currentStep, totalSteps, labels }: CheckoutProgressProps) => {
  return (
    <div className="w-full max-w-md mx-auto">
      <div className="flex items-center justify-between relative">
        {/* Line connecting dots */}
        <div className="absolute top-3 left-0 right-0 h-0.5 bg-border" />
        <div
          className="absolute top-3 left-0 h-0.5 bg-primary transition-all duration-500"
          style={{ width: `${((currentStep - 1) / (totalSteps - 1)) * 100}%` }}
        />

        {labels.map((label, i) => {
          const stepNum = i + 1;
          const isCompleted = stepNum < currentStep;
          const isCurrent = stepNum === currentStep;

          return (
            <div key={i} className="flex flex-col items-center relative z-10">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-300 ${
                  isCompleted
                    ? "bg-primary text-primary-foreground"
                    : isCurrent
                    ? "bg-primary text-primary-foreground ring-2 ring-primary/30 ring-offset-2 ring-offset-background"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {isCompleted ? <Check className="w-3.5 h-3.5" /> : stepNum}
              </div>
              <span
                className={`text-[10px] mt-1.5 font-medium whitespace-nowrap ${
                  isCurrent ? "text-primary" : isCompleted ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CheckoutProgress;
