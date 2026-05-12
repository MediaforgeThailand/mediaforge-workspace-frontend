import generateIcon from "@/assets/generate-icon.png";
import { cn } from "@/lib/utils";

type GenerateIconProps = {
  className?: string;
};

export default function GenerateIcon({ className }: GenerateIconProps) {
  return (
    <img
      src={generateIcon}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={cn("h-4 w-4 shrink-0 object-contain", className)}
    />
  );
}
