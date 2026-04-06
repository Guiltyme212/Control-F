import { ReactNode } from "react";
import { cn } from "../../lib/utils";

type ShineBorderProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  borderWidth?: number;
  duration?: number;
  gradient?: string;
};

const ShineBorder = ({
  children,
  className,
  contentClassName,
  borderWidth = 2,
  duration = 3,
  gradient = "from-blue-500 via-red-500 to-teal-400",
}: ShineBorderProps) => {
  return (
    <div
      className={cn("relative rounded-2xl", className)}
      style={{ padding: borderWidth }}
    >
      {/* Animated Gradient Layer */}
      <div className="absolute inset-0 rounded-2xl overflow-hidden">
        <div
          className={cn(
            "absolute -inset-full blur-sm animate-spin bg-conic",
            gradient
          )}
          style={{ animationDuration: `${duration}s` }}
        />
      </div>

      {/* Content Layer */}
      <div className={cn("relative rounded-2xl bg-bg-card", contentClassName)}>
        {children}
      </div>
    </div>
  );
};

export { ShineBorder };
export default ShineBorder;
