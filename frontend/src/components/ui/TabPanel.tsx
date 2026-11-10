import type { ReactNode } from "react";
import { motion } from "motion/react";
import { EASE } from "@/lib/motion";

/**
 * The body of a tab. Switching tabs swaps the body and eases the new one in,
 * so tabs change with a short rise instead of repainting.
 */
export function TabPanel({
  tabKey,
  className,
  children,
}: {
  tabKey: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <motion.div
      key={tabKey}
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}
