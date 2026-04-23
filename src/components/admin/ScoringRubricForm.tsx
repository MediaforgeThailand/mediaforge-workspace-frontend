import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { RUBRIC_FIELDS } from "@/types/admin";

export interface RubricScores {
  output_quality: number;
  consistency: number;
  commercial_usability: number;
  originality: number;
  efficiency: number;
  workflow_clarity: number;
  safety: number;
}

interface Props {
  scores: RubricScores;
  onChange: (scores: RubricScores) => void;
}

export default function ScoringRubricForm({ scores, onChange }: Props) {
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);

  const handleChange = (key: string, value: number[]) => {
    onChange({ ...scores, [key]: value[0] });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Scoring Rubric</h3>
        <span className="text-xs text-muted-foreground">
          Total: <span className="font-bold text-foreground">{totalScore}/70</span>
        </span>
      </div>

      {RUBRIC_FIELDS.map(({ key, label, description }) => (
        <div key={key} className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-xs font-medium">{label}</Label>
              <p className="text-[10px] text-muted-foreground">{description}</p>
            </div>
            <span className="text-sm font-bold text-foreground w-6 text-right">
              {scores[key as keyof RubricScores]}
            </span>
          </div>
          <Slider
            value={[scores[key as keyof RubricScores]]}
            onValueChange={(v) => handleChange(key, v)}
            min={0}
            max={10}
            step={1}
          />
        </div>
      ))}

      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <p className="text-[10px] text-muted-foreground">
          Flat pricing: 2.5× API cost, 20% creator revshare for all flows
        </p>
      </div>
    </div>
  );
}
