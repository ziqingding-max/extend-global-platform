
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { 
  Bell, 
  Check, 
  CheckCheck, 
  Trash2, 
  Clock,
  Inbox
} from "lucide-react";
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

export default function NotificationCenter() {
  const [open, setOpen] = useState(false);
  
  // Queries
  const { data: notifications, isLoading, refetch } = trpc.notifications.getUnread.useQuery(
    { limit: 20 },
    { 
      refetchInterval: 60000, // Poll every minute
      enabled: true 
    }
  );

  // Mutations
  const markReadMutation = trpc.notifications.markAsRead.useMutation({
    onSuccess: () => refetch()
  });

  const markAllReadMutation = trpc.notifications.markAllAsRead.useMutation({
    onSuccess: () => refetch()
  });

  const unreadCount = notifications?.length || 0;

  const handleMarkRead = (id: number) => {
    markReadMutation.mutate({ id });
  };

  const handleMarkAllRead = () => {
    markAllReadMutation.mutate();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5 text-muted-foreground" />
          {unreadCount > 0 && (
            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] p-0 shadow-lg">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
          <h4 className="font-semibold text-sm">Notifications</h4>
          {unreadCount > 0 && (
            <Button 
              variant="ghost" 
              size="xs" 
              className="h-7 text-xs gap-1"
              onClick={handleMarkAllRead}
              disabled={markAllReadMutation.isPending}
            >
              <CheckCheck className="w-3 h-3" /> Mark all read
            </Button>
          )}
        </div>

        <ScrollArea className="h-[400px]">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              Loading...
            </div>
          ) : unreadCount === 0 ? (
            <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground gap-2">
              <Inbox className="w-10 h-10 opacity-20" />
              <p className="text-sm">No new notifications</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications?.map((notif) => (
                <div 
                  key={notif.id} 
                  className={cn(
                    "p-4 hover:bg-muted/50 transition-colors relative group",
                    !notif.isRead ? "bg-primary/5" : ""
                  )}
                >
                  <div className="flex gap-3">
                    <div className="mt-1">
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        !notif.isRead ? "bg-blue-500" : "bg-transparent"
                      )} />
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {notif.title}
                      </p>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {/* 
                          Since we store raw data in JSON and pre-rendered title, 
                          we might want to render more details here if needed.
                          For now, title serves as the main message.
                        */}
                        {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}
                      </p>
                      
                      {/* Action Buttons */}
                      <div className="pt-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button 
                          variant="outline" 
                          size="xs" 
                          className="h-6 text-[10px]"
                          onClick={() => handleMarkRead(notif.id)}
                        >
                          Dismiss
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
        
        {unreadCount > 0 && (
          <div className="p-2 border-t bg-muted/30 text-center">
            <span className="text-[10px] text-muted-foreground">
              Only showing recent unread items
            </span>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
