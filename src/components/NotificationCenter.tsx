import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Check, CheckCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useNotifications, type AppNotification } from "@/hooks/useNotifications";
import { useLanguage } from "@/contexts/LanguageContext";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";


const NotificationItem = ({
  notification,
  onRead,
  onClick,
}: {
  notification: AppNotification;
  onRead: (id: string) => void;
  onClick: (n: AppNotification) => void;
}) => {
  
  const timeAgo = formatDistanceToNow(new Date(notification.created_at), { addSuffix: true });

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      className={cn(
        "flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors rounded-md group",
        notification.is_read
          ? "opacity-60 hover:opacity-80 hover:bg-secondary/30"
          : "hover:bg-secondary/50"
      )}
      onClick={() => onClick(notification)}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={cn("text-[13px] leading-tight truncate", !notification.is_read && "font-medium text-foreground")}>
            {notification.title}
          </p>
          {!notification.is_read && (
            <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-primary" />
          )}
        </div>
        {notification.message && (
          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{notification.message}</p>
        )}
        <p className="text-[10px] text-muted-foreground/60 mt-1">{timeAgo}</p>
      </div>
      {!notification.is_read && (
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            onRead(notification.id);
          }}
        >
          <Check className="w-3 h-3" />
        </Button>
      )}
    </motion.div>
  );
};

const NotificationCenter = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearAll,
    requestBrowserPermission,
  } = useNotifications();

  const handleClick = (n: AppNotification) => {
    if (!n.is_read) markAsRead(n.id);
    if (n.link) {
      navigate(n.link);
      setOpen(false);
    }
  };

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) requestBrowserPermission();
  };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8">
          <Bell className="w-4 h-4" />
          <AnimatePresence>
            {unreadCount > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center"
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </motion.span>
            )}
          </AnimatePresence>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 p-0 bg-popover border-border shadow-xl"
        sideOffset={8}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
          <h4 className="text-sm font-semibold">{t("notifTitle")}</h4>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px] text-muted-foreground"
                onClick={markAllAsRead}
              >
                <CheckCheck className="w-3 h-3 mr-1" />
                {t("notifReadAll")}
              </Button>
            )}
            {notifications.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px] text-muted-foreground"
                onClick={clearAll}
              >
                <Trash2 className="w-3 h-3 mr-1" />
                {t("notifClear")}
              </Button>
            )}
          </div>
        </div>

        {/* List */}
        <ScrollArea className="max-h-[360px]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <Bell className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-xs">{t("notifEmpty")}</p>
            </div>
          ) : (
            <div className="p-1 space-y-0.5">
              <AnimatePresence>
                {notifications.map((n) => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    onRead={markAsRead}
                    onClick={handleClick}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};

export default NotificationCenter;
