import { useEffect, useRef } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type SignInCaptchaProps = {
  challenge: string;
  value: string;
  onChange: (value: string) => void;
  onRefresh: () => void;
  disabled?: boolean;
  invalid?: boolean;
};

export function SignInCaptcha({
  challenge,
  value,
  onChange,
  onRefresh,
  disabled,
  invalid,
}: SignInCaptchaProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawCaptcha(canvas, challenge);
  }, [challenge]);

  return (
    <div className="space-y-2">
      <Label htmlFor="sign-in-captcha" className="text-sm font-semibold">
        Código de seguridad
      </Label>
      <div className="space-y-2">
        <div className="flex items-center gap-1 border border-input bg-muted/40 p-1">
          <canvas
            ref={canvasRef}
            width={280}
            height={56}
            className="h-14 min-w-0 flex-1 select-none"
            aria-hidden="true"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="rounded-none shrink-0"
            onClick={onRefresh}
            disabled={disabled}
            aria-label="Generar otro código"
          >
            <RefreshCw className="size-4" />
          </Button>
        </div>
        <Input
          id="sign-in-captcha"
          name="captcha"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          maxLength={8}
          disabled={disabled}
          placeholder="Escríbelo aquí"
          aria-invalid={invalid || undefined}
          className={cn(
            "h-11 rounded-none uppercase tracking-[0.18em]",
            invalid && "border-destructive",
          )}
        />
      </div>
    </div>
  );
}

function drawCaptcha(canvas: HTMLCanvasElement, text: string) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#f6f1ea";
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < 8; i += 1) {
    ctx.strokeStyle = `rgba(90, 40, 40, ${0.12 + (i % 3) * 0.08})`;
    ctx.beginPath();
    ctx.moveTo(Math.random() * width, Math.random() * height);
    ctx.lineTo(Math.random() * width, Math.random() * height);
    ctx.stroke();
  }

  const step = width / (text.length + 1);
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i] ?? "";
    ctx.save();
    ctx.translate(step * (i + 1), height / 2 + (Math.random() * 8 - 4));
    ctx.rotate((Math.random() - 0.5) * 0.5);
    ctx.font = `bold ${28 + Math.floor(Math.random() * 6)}px "Times New Roman", serif`;
    ctx.fillStyle = i % 2 === 0 ? "#5c2a32" : "#2c1810";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(char, 0, 0);
    ctx.restore();
  }

  for (let i = 0; i < 40; i += 1) {
    ctx.fillStyle = "rgba(44, 24, 16, 0.18)";
    ctx.fillRect(Math.random() * width, Math.random() * height, 1.4, 1.4);
  }
}
