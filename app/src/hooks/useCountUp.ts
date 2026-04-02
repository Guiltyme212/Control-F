import { useState, useEffect } from 'react';

interface UseCountUpOptionsBase {
  /** When true, animation bounces slightly past the target (105%) then eases back */
  overshoot?: boolean;
}

interface UseCountUpOptionsWithFormatter extends UseCountUpOptionsBase {
  /** Custom formatter for the count value */
  formatter: (n: number) => string;
}

interface UseCountUpOptionsWithoutFormatter extends UseCountUpOptionsBase {
  formatter?: undefined;
}

type UseCountUpOptions = UseCountUpOptionsWithFormatter | UseCountUpOptionsWithoutFormatter;

/**
 * Animates a number from 0 to `end` over `duration` ms.
 * Fully backward-compatible: existing callers (end, duration, start) work unchanged.
 * New callers can pass an options bag with `formatter` and/or `overshoot`.
 */
export function useCountUp(
  end: number,
  duration?: number,
  start?: boolean,
  options?: UseCountUpOptionsWithFormatter
): string;
export function useCountUp(
  end: number,
  duration?: number,
  start?: boolean,
  options?: UseCountUpOptionsWithoutFormatter
): number;
export function useCountUp(
  end: number,
  duration: number = 1500,
  start: boolean = true,
  options?: UseCountUpOptions
): number | string {
  const { formatter, overshoot = false } = options ?? {};
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!start) return;

    let startTime: number;
    let animationFrame: number;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);

      let eased: number;
      if (overshoot) {
        // Overshoot to ~105% then settle back to 100%
        if (progress < 0.8) {
          const sub = progress / 0.8;
          eased = (1 - Math.pow(1 - sub, 3)) * 1.05;
        } else {
          const sub = (progress - 0.8) / 0.2;
          const ease = 1 - Math.pow(1 - sub, 2);
          eased = 1.05 - 0.05 * ease;
        }
      } else {
        eased = 1 - Math.pow(1 - progress, 3);
      }

      setCount(Math.floor(eased * end));

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [end, duration, start, overshoot]);

  if (formatter) return formatter(count);
  return count;
}
