import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { WaitlistQuestion } from "@/lib/waitlistTypes";

interface Props {
  question: WaitlistQuestion;
  value: any;
  onChange: (v: any) => void;
}

export default function WaitlistAnswerInput({ question, value, onChange }: Props) {
  const req = question.requerida ? <span className="text-primary">*</span> : null;

  return (
    <div className="space-y-1.5">
      <Label className="text-sm">
        {question.label} {req}
      </Label>
      {question.tipo === "text" && (
        <Input
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.placeholder}
          maxLength={200}
        />
      )}
      {question.tipo === "textarea" && (
        <Textarea
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.placeholder}
          rows={3}
          maxLength={1000}
        />
      )}
      {question.tipo === "number" && (
        <Input
          type="number"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.placeholder}
        />
      )}
      {question.tipo === "date" && (
        <Input
          type="date"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {question.tipo === "single_choice" && (
        <RadioGroup value={value ?? ""} onValueChange={onChange} className="space-y-1.5">
          {(question.opciones || []).map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
              <RadioGroupItem value={opt} id={`${question.id}_${opt}`} />
              <span>{opt}</span>
            </label>
          ))}
        </RadioGroup>
      )}
      {question.tipo === "multi_choice" && (
        <div className="space-y-1.5">
          {(question.opciones || []).map((opt) => {
            const arr: string[] = Array.isArray(value) ? value : [];
            const checked = arr.includes(opt);
            return (
              <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={checked}
                  onCheckedChange={(v) => {
                    const next = v ? [...arr, opt] : arr.filter((x) => x !== opt);
                    onChange(next);
                  }}
                />
                <span>{opt}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
