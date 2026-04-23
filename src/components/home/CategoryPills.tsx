import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { OFFICIAL_CATEGORIES } from "@/constants/categories";

const CATEGORIES = ["All", ...OFFICIAL_CATEGORIES];

interface CategoryPillsProps {
  selected: string;
  onSelect: (cat: string) => void;
}

const CategoryPills = ({ selected, onSelect }: CategoryPillsProps) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 0.15, duration: 0.5 }}
    className="flex gap-2.5 overflow-x-auto scrollbar-hide pb-1"
  >
    {CATEGORIES.map((label) => (
      <button
        key={label}
        onClick={() => onSelect(label)}
        className={cn(
          "whitespace-nowrap rounded-full px-5 py-2.5 text-sm font-medium transition-all duration-300 border shrink-0",
          selected === label
            ? "bg-white/10 border-white/20 text-foreground shadow-lg shadow-white/5 backdrop-blur-md"
            : "bg-white/[0.04] border-white/[0.08] text-muted-foreground hover:bg-white/[0.08] hover:border-white/15 hover:text-foreground backdrop-blur-sm"
        )}
      >
        {label}
      </button>
    ))}
  </motion.div>
);

export default CategoryPills;
