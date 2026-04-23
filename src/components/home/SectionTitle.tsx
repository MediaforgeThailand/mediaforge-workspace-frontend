import { motion } from "framer-motion";
import { type LucideIcon } from "lucide-react";

interface SectionTitleProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  delay?: number;
}

const SectionTitle = ({ icon: Icon, title, subtitle, delay = 0 }: SectionTitleProps) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay, duration: 0.5 }}
    className="space-y-1"
  >
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center">
        <Icon className="w-4 h-4 text-foreground" />
      </div>
      <h2 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">{title}</h2>
    </div>
    {subtitle && <p className="text-sm text-muted-foreground pl-11">{subtitle}</p>}
  </motion.div>
);

export default SectionTitle;
