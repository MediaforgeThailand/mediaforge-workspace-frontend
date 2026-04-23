import { CheckCircle2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import type { SurveyQuestion, SurveyOption } from "./surveyConfig";

interface QuestionProps {
  question: SurveyQuestion;
  language: string;
  value: any;
  onChange: (key: string, value: any) => void;
}

/* ─── Single Select ─── */
const SingleSelect = ({ question, language, value, onChange }: QuestionProps) => (
  <div className="grid gap-2">
    {question.options?.map((opt) => (
      <button
        key={opt.value}
        onClick={() => onChange(question.key, opt.value)}
        className={`w-full text-left px-4 py-3 rounded-xl border transition-all duration-200 flex items-center gap-3 ${
          value === opt.value
            ? "border-white/30 bg-white/[0.08] ring-2 ring-white/20"
            : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]"
        }`}
      >
        <span className="text-sm font-medium text-white">{opt.label[language] || opt.label.en}</span>
        {value === opt.value && <CheckCircle2 className="w-4 h-4 text-white/60 ml-auto shrink-0" />}
      </button>
    ))}
  </div>
);

/* ─── Multi Select ─── */
const MultiSelect = ({ question, language, value, onChange }: QuestionProps) => {
  const selected: string[] = Array.isArray(value) ? value : [];
  const toggle = (v: string) => {
    const next = selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v];
    onChange(question.key, next);
  };
  return (
    <div className="grid gap-2">
      {question.options?.map((opt) => (
        <button
          key={opt.value}
          onClick={() => toggle(opt.value)}
        className={`w-full text-left px-4 py-3 rounded-xl border transition-all duration-200 flex items-center gap-3 ${
            selected.includes(opt.value)
              ? "border-white/30 bg-white/[0.08] ring-2 ring-white/20"
              : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]"
          }`}
        >
          <div
            className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-all ${
              selected.includes(opt.value) ? "border-white/50 bg-white/20" : "border-white/20"
            }`}
          >
            {selected.includes(opt.value) && (
              <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
          <span className="text-sm font-medium text-white">{opt.label[language] || opt.label.en}</span>
        </button>
      ))}
    </div>
  );
};

/* ─── Ranking ─── */
const Ranking = ({ question, language, value, onChange }: QuestionProps) => {
  const ranked: string[] = Array.isArray(value) ? value : [];
  const toggle = (key: string) => {
    if (ranked.includes(key)) {
      // Remove this item and all after it
      const idx = ranked.indexOf(key);
      onChange(question.key, ranked.slice(0, idx));
    } else {
      onChange(question.key, [...ranked, key]);
    }
  };
  return (
    <div className="grid gap-2">
      {question.items?.map((item) => {
        const rank = ranked.indexOf(item.key);
        const isRanked = rank !== -1;
        return (
          <button
            key={item.key}
            onClick={() => toggle(item.key)}
          className={`w-full text-left px-4 py-3 rounded-xl border transition-all duration-200 flex items-center gap-3 ${
              isRanked
                ? "border-white/30 bg-white/[0.08] ring-2 ring-white/20"
                : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]"
            }`}
          >
            <div
              className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-bold transition-all ${
                isRanked ? "bg-white/15 text-white" : "bg-white/[0.06] text-white/30"
              }`}
            >
              {isRanked ? rank + 1 : "—"}
            </div>
            <span className="text-sm font-medium text-white">{item.label[language] || item.label.en}</span>
          </button>
        );
      })}
    </div>
  );
};

/* ─── Rating (1–5) ─── */
const Rating = ({ question, language, value, onChange }: QuestionProps) => {
  const ratings: Record<string, number> = typeof value === "object" && value !== null ? value : {};
  const setRating = (key: string, score: number) => {
    onChange(question.key, { ...ratings, [key]: score });
  };
  return (
    <div className="space-y-3">
      {question.items?.map((item) => (
        <div key={item.key} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-2">
          <p className="text-sm font-medium text-white leading-snug">
            {item.label[language] || item.label.en}
          </p>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((score) => (
              <button
                key={score}
                onClick={() => setRating(item.key, score)}
                className={`w-10 h-10 rounded-lg text-sm font-bold transition-all ${
                  ratings[item.key] === score
                    ? "bg-white/20 text-white ring-2 ring-white/20 scale-110"
                    : ratings[item.key] && ratings[item.key] >= score
                      ? "bg-white/10 text-white/60"
                      : "bg-white/[0.04] text-white/30 hover:bg-white/[0.08]"
                }`}
              >
                {score}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

/* ─── Text Input ─── */
const TextInput = ({ question, language, value, onChange }: QuestionProps) => (
  <Textarea
    value={value || ""}
    onChange={(e) => onChange(question.key, e.target.value)}
    placeholder={question.placeholder?.[language] || question.placeholder?.en || ""}
    maxLength={question.maxLength || 500}
    className="min-h-[100px] bg-white/[0.04] border-white/10 text-white placeholder:text-white/30 focus:border-white/25 resize-none"
  />
);

/* ─── Main Renderer ─── */
export const SurveyQuestionRenderer = (props: QuestionProps) => {
  const { question } = props;
  switch (question.type) {
    case "single":
    case "range":
      return <SingleSelect {...props} />;
    case "multi":
      return <MultiSelect {...props} />;
    case "ranking":
      return <Ranking {...props} />;
    case "rating":
      return <Rating {...props} />;
    case "text":
      return <TextInput {...props} />;
    default:
      return null;
  }
};
