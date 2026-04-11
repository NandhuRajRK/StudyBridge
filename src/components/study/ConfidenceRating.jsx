import { useState } from "react";
import { Button } from "@/components/ui/button";

const levels = [
  { value: 1, label: "Not confident" },
  { value: 2, label: "Slightly" },
  { value: 3, label: "Somewhat" },
  { value: 4, label: "Confident" },
  { value: 5, label: "Very confident" },
];

export default function ConfidenceRating({ title, subtitle, onSubmit }) {
  const [selected, setSelected] = useState(null);

  return (
    <div className="text-center">
      <h2 className="text-xl font-semibold mb-1">{title}</h2>
      <p className="text-sm text-muted-foreground mb-8">{subtitle}</p>

      <div className="flex gap-3 justify-center mb-8">
        {levels.map(level => (
          <button
            key={level.value}
            onClick={() => setSelected(level.value)}
            className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all w-20 ${
              selected === level.value
                ? "border-primary bg-primary/5 scale-105"
                : "border-transparent hover:border-border hover:bg-muted/50"
            }`}
          >
            <span className="text-2xl font-semibold">{level.value}</span>
            <span className="text-xs text-muted-foreground">{level.label}</span>
          </button>
        ))}
      </div>

      <Button
        onClick={() => selected && onSubmit(selected)}
        disabled={!selected}
        size="lg"
      >
        Continue
      </Button>
    </div>
  );
}
